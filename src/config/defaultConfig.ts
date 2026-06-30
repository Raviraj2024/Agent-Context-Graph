export interface AgentContextGraphConfig {
  maxFileBytes: number;
  excludeDirectories: string[];
  excludeFiles: string[];
  hardStopPathFragments: string[];
  hardStopGlobs: string[];
  publicApiTags: string[];
}

export const defaultConfig: AgentContextGraphConfig = {
  maxFileBytes: 1024 * 1024,
  excludeDirectories: [
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".venv",
    "__pycache__"
  ],
  excludeFiles: [".DS_Store"],
  hardStopPathFragments: [
    "auth",
    "session",
    "permission",
    "rbac",
    "payment",
    "billing",
    "migrations",
    "schema",
    ".env",
    "secrets"
  ],
  hardStopGlobs: [".github/workflows/**", "Dockerfile", "docker-compose*"],
  publicApiTags: ["public-api"]
};
