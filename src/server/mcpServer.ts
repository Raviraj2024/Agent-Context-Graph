import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { buildAndPersistGraph } from "../graph/builder.js";
import { initOrRefreshGraph } from "../graph/updater.js";
import type { GraphEdge, GraphNode } from "../graph/schema.js";
import { GraphStore } from "../graph/store.js";
import { getChangeHistory } from "../logging/changeIndex.js";
import { SessionLogger } from "../logging/logger.js";
import { createTaskScope, classifyChanges } from "../scopeLock/engine.js";
import type { TaskScope } from "../scopeLock/types.js";
import { assertInsideProject, toProjectRelative } from "../security/pathSafety.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

const scopes = new Map<string, TaskScope>();

export function resolveProjectRoot(projectRoot?: string): string {
  return projectRoot ?? process.env.AGENT_CONTEXT_GRAPH_ROOT ?? process.cwd();
}

const toolSchemas = [
  {
    name: "get_project_overview",
    description: "Return root node, detected tech stack, entry points, and graph counts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "init_or_refresh_graph",
    description: "Build or refresh the project graph.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_node_context",
    description: "Return a node and its immediate one-hop edges.",
    inputSchema: {
      type: "object",
      properties: { identifier: { type: "string" } },
      required: ["identifier"],
      additionalProperties: false
    }
  },
  {
    name: "get_blast_radius",
    description: "Return reachable nodes through calls/imports/inherits up to maxDepth.",
    inputSchema: {
      type: "object",
      properties: { identifier: { type: "string" }, maxDepth: { type: "number", minimum: 1, maximum: 10 } },
      required: ["identifier", "maxDepth"],
      additionalProperties: false
    }
  },
  {
    name: "get_definitive_path",
    description: "Return minimal ordered files/nodes for an intended change.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: { type: "string" },
        changeType: { enum: ["rename", "change_signature", "delete", "modify_logic"] }
      },
      required: ["identifier", "changeType"],
      additionalProperties: false
    }
  },
  {
    name: "query_best_practices",
    description: "Return bundled best-practice nodes for a domain.",
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string" } },
      required: ["domain"],
      additionalProperties: false
    }
  },
  {
    name: "declare_task_scope",
    description: "Declare task scope before edits.",
    inputSchema: {
      type: "object",
      properties: {
        taskDescription: { type: "string" },
        targetIdentifiers: { type: "array", items: { type: "string" } }
      },
      required: ["taskDescription", "targetIdentifiers"],
      additionalProperties: false
    }
  },
  {
    name: "check_scope",
    description: "Classify proposed changes against a declared scope.",
    inputSchema: {
      type: "object",
      properties: {
        scopeId: { type: "string" },
        proposedChanges: { type: "array", items: { type: "string" } }
      },
      required: ["scopeId", "proposedChanges"],
      additionalProperties: false
    }
  },
  {
    name: "record_change",
    description: "Record an actual file mutation immediately after it happens.",
    inputSchema: {
      type: "object",
      properties: {
        scopeId: { type: "string" },
        filePath: { type: "string" },
        action: { enum: ["file_created", "file_modified", "file_deleted"] },
        summary: { type: "string" },
        reasoning: { type: "string" }
      },
      required: ["scopeId", "filePath", "action", "summary", "reasoning"],
      additionalProperties: false
    }
  },
  {
    name: "get_node_history",
    description: "Return compacted change history for a node or path.",
    inputSchema: {
      type: "object",
      properties: { identifier: { type: "string" } },
      required: ["identifier"],
      additionalProperties: false
    }
  }
];

function textResult(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function withStore<T>(projectRoot: string, fn: (store: GraphStore) => T): T {
  const store = new GraphStore(projectRoot);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

function detectTechStack(nodes: GraphNode[]): string[] {
  const stack = new Set<string>();
  for (const node of nodes) {
    if (node.language) stack.add(node.language);
    if (node.filePath === "package.json") stack.add("node");
    if (node.filePath === "pyproject.toml" || node.filePath === "requirements.txt") stack.add("python");
  }
  return [...stack].sort();
}

function entryPoints(nodes: GraphNode[]): string[] {
  return nodes
    .filter((node) => node.type === "file" && /(^|\/)(index|main|server|app|cli)\.(ts|tsx|js|py)$/.test(node.filePath ?? ""))
    .map((node) => node.filePath as string);
}

function traverse(store: GraphStore, startId: string, maxDepth: number): { static: GraphNode[]; inferred: GraphNode[]; edges: GraphEdge[] } {
  const visited = new Set<string>([startId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  const staticNodes = new Map<string, GraphNode>();
  const inferredNodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const edge of store.adjacent(current.id, ["calls", "imports", "inherits"])) {
      edges.push(edge);
      const nextId = edge.sourceId === current.id ? edge.targetId : edge.sourceId;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const node = store.getNodeById(nextId);
      if (!node) continue;
      if (edge.confidence === "static") staticNodes.set(node.id, node);
      else inferredNodes.set(node.id, node);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  return { static: [...staticNodes.values()], inferred: [...inferredNodes.values()], edges };
}

export function createMcpServer(projectRoot?: string): Server {
  const resolvedProjectRoot = resolveProjectRoot(projectRoot);
  const logger = new SessionLogger(resolvedProjectRoot);
  const server = new Server(
    {
      name: "agent-context-graph",
      version: "0.1.0"
    },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolSchemas }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};
    const name = request.params.name;

    if (name === "init_or_refresh_graph") {
      const result = initOrRefreshGraph(resolvedProjectRoot);
      logger.write({
        scopeId: null,
        action: "graph_updated",
        filePath: null,
        summary: `Graph ${result.mode}.`,
        reasoning: `Changed files: ${result.changedFiles.join(", ") || "none"}.`,
        approvedBy: "auto"
      });
      return textResult(result);
    }

    return withStore(resolvedProjectRoot, (store) => {
      if (name === "get_project_overview") {
        const nodes = store.listNodes();
        const rootNode = nodes.find((node) => node.type === "root") ?? null;
        return textResult({ rootNode, techStack: detectTechStack(nodes), entryPoints: entryPoints(nodes), counts: store.counts() });
      }

      if (name === "get_node_context") {
        const { identifier } = z.object({ identifier: z.string() }).parse(args);
        const node = store.getNode(identifier);
        const edges = node ? store.edgesForNode(node.id) : [];
        const neighbors = edges
          .map((edge) => store.getNodeById(edge.sourceId === node?.id ? edge.targetId : edge.sourceId))
          .filter(Boolean);
        return textResult({ node, edges, neighbors });
      }

      if (name === "get_blast_radius") {
        const { identifier, maxDepth } = z.object({ identifier: z.string(), maxDepth: z.number().int().min(1).max(10) }).parse(args);
        const node = store.getNode(identifier);
        if (!node) return textResult({ error: "not_found", identifier });
        const radius = traverse(store, node.id, maxDepth);
        return textResult({ start: node, ...radius, note: "Verify inferred edges before relying on them." });
      }

      if (name === "get_definitive_path") {
        const parsed = z.object({ identifier: z.string(), changeType: z.enum(["rename", "change_signature", "delete", "modify_logic"]) }).parse(args);
        const node = store.getNode(parsed.identifier);
        if (!node) return textResult({ error: "not_found", identifier: parsed.identifier });
        const depth = parsed.changeType === "modify_logic" ? 1 : 3;
        const radius = traverse(store, node.id, depth);
        const ordered = [node, ...radius.static, ...radius.inferred].map((item) => ({
          id: item.id,
          type: item.type,
          filePath: item.filePath,
          qualifiedName: item.qualifiedName
        }));
        return textResult({ changeType: parsed.changeType, ordered, note: "Inferred entries require source verification before edits." });
      }

      if (name === "query_best_practices") {
        const { domain } = z.object({ domain: z.string() }).parse(args);
        const matches = store
          .listNodes()
          .filter((node) => node.type === "standard" && node.tags.some((tag) => tag.includes(domain) || domain.includes(tag)));
        return textResult({ domain, nodes: matches });
      }

      if (name === "declare_task_scope") {
        const parsed = z.object({ taskDescription: z.string(), targetIdentifiers: z.array(z.string()) }).parse(args);
        const declaredNodeIds = parsed.targetIdentifiers
          .map((identifier) => store.getNode(identifier)?.id ?? identifier)
          .filter(Boolean);
        const scope = createTaskScope(logger.sessionId, parsed.taskDescription, declaredNodeIds);
        scopes.set(scope.scopeId, scope);
        logger.write({
          scopeId: scope.scopeId,
          action: "scope_declared",
          filePath: null,
          summary: parsed.taskDescription,
          reasoning: `Declared targets: ${parsed.targetIdentifiers.join(", ")}.`,
          approvedBy: "auto"
        });
        return textResult(scope);
      }

      if (name === "check_scope") {
        const parsed = z.object({ scopeId: z.string(), proposedChanges: z.array(z.string()) }).parse(args);
        const scope = scopes.get(parsed.scopeId);
        if (!scope) return textResult({ error: "scope_not_found", scopeId: parsed.scopeId });
        const safeChanges = parsed.proposedChanges.map((change) => {
          try {
            return toProjectRelative(resolvedProjectRoot, change);
          } catch {
            return change;
          }
        });
        const decisions = classifyChanges(resolvedProjectRoot, store, scope, safeChanges);
        for (const decision of decisions) {
          logger.write({
            scopeId: scope.scopeId,
            action: "scope_decision",
            filePath: decision.nodeOrPath,
            summary: decision.classification,
            reasoning: decision.reason,
            approvedBy: decision.approved ? "auto" : null
          });
        }
        return textResult({ scopeId: parsed.scopeId, decisions });
      }

      if (name === "record_change") {
        const parsed = z.object({
          scopeId: z.string(),
          filePath: z.string(),
          action: z.enum(["file_created", "file_modified", "file_deleted"]),
          summary: z.string(),
          reasoning: z.string()
        }).parse(args);
        const safePath = toProjectRelative(resolvedProjectRoot, parsed.filePath);
        assertInsideProject(resolvedProjectRoot, safePath);
        const entry = logger.write({
          scopeId: parsed.scopeId,
          action: parsed.action,
          filePath: safePath,
          summary: parsed.summary,
          reasoning: parsed.reasoning,
          approvedBy: "auto"
        });
        return textResult({ recorded: true, entry });
      }

      if (name === "get_node_history") {
        const { identifier } = z.object({ identifier: z.string() }).parse(args);
        const node = store.getNode(identifier);
        return textResult({ identifier, history: getChangeHistory(resolvedProjectRoot, node?.filePath ?? identifier) });
      }

      return textResult({ error: "unknown_tool", name });
    });
  });

  return server;
}

export async function serve(projectRoot?: string): Promise<void> {
  const server = createMcpServer(projectRoot);
  await server.connect(new StdioServerTransport());
}

export { toolSchemas };
