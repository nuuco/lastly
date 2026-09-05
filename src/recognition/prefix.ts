const PREFIX = /^\s*라스틀리(?:야|요)?[\s,.\u2026]*/;

export function stripPrefix(text: string): string {
  return text.replace(PREFIX, "").trim();
}
