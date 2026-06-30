import type { GraphEdge, GraphNode } from "../graph/schema.js";

export interface ParsedFile {
  nodes: GraphNode[];
  edges: GraphEdge[];
  imports: string[];
}

export interface LanguageAdapter {
  language: string;
  extensions: string[];
  parseFile(args: {
    projectRoot: string;
    filePath: string;
    relativePath: string;
    source: string;
    indexedAt: string;
  }): ParsedFile;
}
