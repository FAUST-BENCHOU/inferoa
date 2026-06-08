export function isPathListInput(text: string): boolean {
  return pathListEntries(text.trim()).length > 0;
}

export function singlePathInput(text: string): string | undefined {
  const entries = pathListEntries(text.trim());
  return entries.length === 1 ? entries[0] : undefined;
}

export function pathListEntries(text: string): string[] {
  if (!text || text.length > 8192) {
    return [];
  }
  const entries = text.includes("\n") ? text.split(/\r?\n/).flatMap(splitPathList) : splitPathList(text);
  if (!entries.length || entries.length > 32) {
    return [];
  }
  return entries.every((line) => looksLikePath(line)) ? entries : [];
}

function splitPathList(text: string): string[] {
  const entries: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  for (let index = 0; index < text.length;) {
    const char = text[index] ?? "";
    if (!char) {
      break;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === "\\" && index + 1 < text.length) {
        index += 1;
        current += text[index] ?? "";
      } else {
        current += char;
      }
      index += 1;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === "\\" && index + 1 < text.length) {
      index += 1;
      current += text[index] ?? "";
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      pushPathEntry(entries, current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  pushPathEntry(entries, current);
  return entries;
}

function pushPathEntry(entries: string[], value: string): void {
  const clean = value.trim();
  if (clean) {
    entries.push(clean);
  }
}

function looksLikePath(text: string): boolean {
  if (/^(?:file:\/\/|~\/|\.\.?\/)[^\0]+/.test(text)) {
    return true;
  }
  if (!text.startsWith("/") || text === "/") {
    return false;
  }
  const tail = text.slice(1);
  return tail.includes("/") || /\.[A-Za-z0-9]{1,12}(?:[?#].*)?$/.test(tail);
}
