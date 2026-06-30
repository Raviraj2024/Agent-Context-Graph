export type GraphNodeType =
  | "root"
  | "directory"
  | "file"
  | "class"
  | "function"
  | "method"
  | "variable_export"
  | "standard";

export type GraphRelation =
  | "imports"
  | "calls"
  | "inherits"
  | "implements"
  | "tested_by"
  | "depends_on"
  | "configures"
  | "contains";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  qualifiedName: string;
  filePath: string | null;
  language: string | null;
  startLine: number | null;
  endLine: number | null;
  signature: string | null;
  docstring: string | null;
  contentHash: string | null;
  tags: string[];
  lastIndexedAt: string;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: GraphRelation;
  confidence: "static" | "inferred";
  reason: string | null;
}

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ProjectOverview {
  rootNode: GraphNode;
  techStack: string[];
  entryPoints: string[];
  counts: {
    nodes: number;
    edges: number;
  };
}
