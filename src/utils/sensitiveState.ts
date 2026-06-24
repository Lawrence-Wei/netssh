const SENSITIVE_FIELDS = new Set([
  "password",
  "passphrase",
  "privatekey",
  "ephemeralpassword",
  "secret",
]);

const SAFE_METADATA_FIELDS = new Set(["haspassword"]);

export function containsSensitiveAppState(key: string, value: string) {
  if (isSensitiveFieldName(key)) return true;
  try {
    return containsSensitiveJsonField(JSON.parse(value));
  } catch {
    return containsSensitiveRawField(value);
  }
}

function containsSensitiveJsonField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveJsonField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    isSensitiveFieldName(key) || containsSensitiveJsonField(nested)
  );
}

function containsSensitiveRawField(value: string) {
  return [
    /["']password["']\s*[:=]/i,
    /["']passphrase["']\s*[:=]/i,
    /["']privateKey["']\s*[:=]/i,
    /["']private_key["']\s*[:=]/i,
    /["']ephemeralPassword["']\s*[:=]/i,
    /["']ephemeral_password["']\s*[:=]/i,
    /["']secret["']\s*[:=]/i,
  ].some((pattern) => pattern.test(value));
}

function isSensitiveFieldName(value: string) {
  const normalized = value.toLowerCase().replace(/[_\-\s]/g, "");
  if (SAFE_METADATA_FIELDS.has(normalized)) return false;
  return SENSITIVE_FIELDS.has(normalized);
}
