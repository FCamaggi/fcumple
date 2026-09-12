/**
 * The door QR encodes either the full guest link (`https://.../i/{token}`,
 * matching the `/i/:token` route in App.tsx) or the bare token by itself
 * (both are valid per docs/BACKLOG.md Etapa 3 -- "no hace falta un formato
 * nuevo"). This parses either shape tolerantly: a parseable URL yields its
 * last non-empty path segment, anything else is treated as a bare token
 * (trimmed of surrounding whitespace, which some QR generators/scanners
 * add around the payload).
 */
export function extractTokenFromQrText(rawText: string): string {
  const trimmed = rawText.trim();

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 0) return segments[segments.length - 1];
    return trimmed;
  } catch {
    return trimmed;
  }
}
