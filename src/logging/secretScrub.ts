const AWS_ACCESS_KEY = /AKIA[0-9A-Z]{16}/g;
const GENERIC_SECRET = /\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*["']?[^"',\s}]+["']?/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PEM_PRIVATE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/g;

export function scrubSecrets(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value
    .replace(AWS_ACCESS_KEY, "[REDACTED_AWS_KEY]")
    .replace(GENERIC_SECRET, (_match, key: string) => `${key}=[REDACTED_SECRET]`)
    .replace(JWT, "[REDACTED_JWT]")
    .replace(PEM_PRIVATE, "-----BEGIN [REDACTED_PRIVATE_KEY]-----");
}

export function scrubObject<T>(value: T): T {
  if (typeof value === "string") {
    return scrubSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubObject(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubObject(item)])
    ) as T;
  }
  return value;
}
