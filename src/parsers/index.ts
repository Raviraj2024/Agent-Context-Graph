import { extname } from "node:path";
import type { LanguageAdapter } from "./LanguageAdapter.js";
import { pythonAdapter } from "./pythonAdapter.js";
import { typescriptAdapter } from "./typescriptAdapter.js";

export const adapters: LanguageAdapter[] = [typescriptAdapter, pythonAdapter];

export function adapterForPath(filePath: string): LanguageAdapter | null {
  const ext = extname(filePath);
  return adapters.find((adapter) => adapter.extensions.includes(ext)) ?? null;
}
