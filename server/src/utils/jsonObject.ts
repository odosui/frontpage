/**
 * The outermost `{...}` in a string, or null when there is none.
 *
 * Models wrap their json in prose, fences and thinking-out-loud, so the object
 * has to be cut out of the message. Braces are counted rather than matched with
 * a regex: a greedy `\{[\s\S]*\}` runs to the last brace in the message, which
 * for an answer followed by a postscript swallows the prose between them, and
 * for a truncated answer — the common failure — reports the whole tail as an
 * object instead of saying it never closed.
 */
export function outermostObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return raw.slice(start, i + 1);
  }

  // an object that opened and never closed: the answer was cut off mid-write
  return null;
}
