import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphEdge, GraphNode, GraphRelation } from "./schema.js";

export interface GraphCounts {
  nodes: number;
  edges: number;
}

export class CacheLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CacheLockError";
  }
}

export function acgDir(projectRoot: string): string {
  return join(projectRoot, ".agent-context-graph");
}

export function cachePath(projectRoot: string): string {
  return join(acgDir(projectRoot), "cache.sqlite");
}

export function lockPath(projectRoot: string): string {
  return join(acgDir(projectRoot), ".lock");
}

export function isPidRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireCacheLock(projectRoot: string): () => void {
  mkdirSync(acgDir(projectRoot), { recursive: true });
  const path = lockPath(projectRoot);

  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw || "{}") as { pid?: number; timestamp?: string };
    if (parsed.pid && isPidRunning(parsed.pid)) {
      throw new CacheLockError(`Graph cache is locked by live process ${parsed.pid}.`);
    }
    rmSync(path, { force: true });
  }

  writeFileSync(path, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }), {
    flag: "wx"
  });

  return () => {
    rmSync(path, { force: true });
  };
}

function serializeNode(node: GraphNode): Record<string, unknown> {
  return {
    ...node,
    tags: JSON.stringify(node.tags)
  };
}

function rowToNode(row: Record<string, unknown>): GraphNode {
  return {
    id: String(row.id),
    type: row.type as GraphNode["type"],
    name: String(row.name),
    qualifiedName: String(row.qualifiedName),
    filePath: row.filePath === null ? null : String(row.filePath),
    language: row.language === null ? null : String(row.language),
    startLine: row.startLine === null ? null : Number(row.startLine),
    endLine: row.endLine === null ? null : Number(row.endLine),
    signature: row.signature === null ? null : String(row.signature),
    docstring: row.docstring === null ? null : String(row.docstring),
    contentHash: row.contentHash === null ? null : String(row.contentHash),
    tags: JSON.parse(String(row.tags || "[]")) as string[],
    lastIndexedAt: String(row.lastIndexedAt)
  };
}

export class GraphStore {
  readonly db: Database.Database;

  constructor(readonly projectRoot: string) {
    mkdirSync(acgDir(projectRoot), { recursive: true });
    this.db = new Database(cachePath(projectRoot));
    this.init();
  }

  close(): void {
    this.db.close();
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        qualifiedName TEXT NOT NULL,
        filePath TEXT,
        language TEXT,
        startLine INTEGER,
        endLine INTEGER,
        signature TEXT,
        docstring TEXT,
        contentHash TEXT,
        tags TEXT NOT NULL,
        lastIndexedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(filePath);
      CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualifiedName);
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        sourceId TEXT NOT NULL,
        targetId TEXT NOT NULL,
        relation TEXT NOT NULL,
        confidence TEXT NOT NULL,
        reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(sourceId);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(targetId);
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  replaceAll(nodes: GraphNode[], edges: GraphEdge[]): void {
    const release = acquireCacheLock(this.projectRoot);
    try {
      const tx = this.db.transaction(() => {
        this.db.prepare("DELETE FROM edges").run();
        this.db.prepare("DELETE FROM nodes").run();
        for (const node of nodes) {
          this.upsertNode(node);
        }
        for (const edge of edges) {
          this.upsertEdge(edge);
        }
        this.setMeta("lastBuildAt", new Date().toISOString());
      });
      tx();
    } finally {
      release();
    }
  }

  removeFile(filePath: string): void {
    const nodeIds = this.db
      .prepare("SELECT id FROM nodes WHERE filePath = ?")
      .all(filePath)
      .map((row) => String((row as { id: string }).id));
    for (const id of nodeIds) {
      this.db.prepare("DELETE FROM edges WHERE sourceId = ? OR targetId = ?").run(id, id);
    }
    this.db.prepare("DELETE FROM nodes WHERE filePath = ?").run(filePath);
  }

  upsertNode(node: GraphNode): void {
    const data = serializeNode(node);
    this.db
      .prepare(
        `INSERT INTO nodes
        (id, type, name, qualifiedName, filePath, language, startLine, endLine, signature, docstring, contentHash, tags, lastIndexedAt)
        VALUES (@id, @type, @name, @qualifiedName, @filePath, @language, @startLine, @endLine, @signature, @docstring, @contentHash, @tags, @lastIndexedAt)
        ON CONFLICT(id) DO UPDATE SET
          type=excluded.type, name=excluded.name, qualifiedName=excluded.qualifiedName,
          filePath=excluded.filePath, language=excluded.language, startLine=excluded.startLine,
          endLine=excluded.endLine, signature=excluded.signature, docstring=excluded.docstring,
          contentHash=excluded.contentHash, tags=excluded.tags, lastIndexedAt=excluded.lastIndexedAt`
      )
      .run(data);
  }

  upsertEdge(edge: GraphEdge): void {
    this.db
      .prepare(
        `INSERT INTO edges (id, sourceId, targetId, relation, confidence, reason)
         VALUES (@id, @sourceId, @targetId, @relation, @confidence, @reason)
         ON CONFLICT(id) DO UPDATE SET
          sourceId=excluded.sourceId, targetId=excluded.targetId, relation=excluded.relation,
          confidence=excluded.confidence, reason=excluded.reason`
      )
      .run(edge);
  }

  getNode(identifier: string): GraphNode | null {
    const row = this.db
      .prepare("SELECT * FROM nodes WHERE id = ? OR filePath = ? OR qualifiedName = ? LIMIT 1")
      .get(identifier, identifier, identifier) as Record<string, unknown> | undefined;
    return row ? rowToNode(row) : null;
  }

  getNodeById(id: string): GraphNode | null {
    const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToNode(row) : null;
  }

  listNodes(): GraphNode[] {
    return this.db
      .prepare("SELECT * FROM nodes ORDER BY qualifiedName")
      .all()
      .map((row) => rowToNode(row as Record<string, unknown>));
  }

  listEdges(): GraphEdge[] {
    return this.db.prepare("SELECT * FROM edges ORDER BY sourceId, relation, targetId").all() as GraphEdge[];
  }

  edgesForNode(id: string): GraphEdge[] {
    return this.db
      .prepare("SELECT * FROM edges WHERE sourceId = ? OR targetId = ? ORDER BY relation")
      .all(id, id) as GraphEdge[];
  }

  adjacent(id: string, relations: GraphRelation[]): GraphEdge[] {
    const placeholders = relations.map(() => "?").join(",");
    return this.db
      .prepare(`SELECT * FROM edges WHERE (sourceId = ? OR targetId = ?) AND relation IN (${placeholders})`)
      .all(id, id, ...relations) as GraphEdge[];
  }

  counts(): GraphCounts {
    return {
      nodes: Number((this.db.prepare("SELECT COUNT(*) AS count FROM nodes").get() as { count: number }).count),
      edges: Number((this.db.prepare("SELECT COUNT(*) AS count FROM edges").get() as { count: number }).count)
    };
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }
}
