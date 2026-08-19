export const EXTRACT_BODY_LIMIT_BYTES = 16 * 1024;
export const MCP_BODY_LIMIT_BYTES = 64 * 1024;

export function requestBodyTooLarge(request, maximumBytes) {
  const raw = requestHeader(request, "content-length");
  if (raw === undefined) return false;
  const length = Number(raw);
  return Number.isFinite(length) && length > maximumBytes;
}

export function requestHasUnsupportedJsonType(request) {
  const raw = requestHeader(request, "content-type");
  if (raw === undefined || raw === "") return false;
  const type = String(raw).split(";", 1)[0].trim().toLowerCase();
  return type !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(type);
}

function requestHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
