import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSafetyError";
  }
}

export function canonicalProjectRoot(projectRoot: string): string {
  const resolved = resolve(projectRoot);
  return existsSync(resolved) ? realpathSync(resolved) : resolved;
}

export function assertInsideProject(projectRoot: string, candidatePath: string): string {
  if (!candidatePath || candidatePath.includes("\0")) {
    throw new PathSafetyError("Path is empty or contains a null byte.");
  }

  const root = canonicalProjectRoot(projectRoot);
  const absolute = isAbsolute(candidatePath) ? normalize(candidatePath) : resolve(root, candidatePath);
  const parent = existsSync(absolute) ? absolute : dirname(absolute);
  const realParent = existsSync(parent) ? realpathSync(parent) : realpathSync(root);
  const finalPath = existsSync(absolute) ? realpathSync(absolute) : resolve(realParent, absolute.slice(parent.length + 1));
  const rel = relative(root, finalPath);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return finalPath;
  }

  throw new PathSafetyError(`Path resolves outside project root: ${candidatePath}`);
}

export function toProjectRelative(projectRoot: string, candidatePath: string): string {
  const root = canonicalProjectRoot(projectRoot);
  const safe = assertInsideProject(root, candidatePath);
  return relative(root, safe).split(sep).join("/");
}

export function rejectSymlinkEscape(projectRoot: string, candidatePath: string): void {
  const safe = assertInsideProject(projectRoot, candidatePath);
  if (existsSync(safe) && lstatSync(safe).isSymbolicLink()) {
    assertInsideProject(projectRoot, realpathSync(safe));
  }
}
