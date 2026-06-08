export function decodeEscapedTextArgument(value: string): string {
  // Handle literal escaped multiline text from tool arguments: \r\n -> \n, \n -> \n, \t -> \t, \" -> ", \\ -> \.
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\r\n/g, "\n");
}

export function textArgumentCandidates(value: string): Array<{ text: string; decoded_escapes: boolean }> {
  const decoded = decodeEscapedTextArgument(value);
  if (decoded === value) {
    return [{ text: value, decoded_escapes: false }];
  }
  return [
    { text: value, decoded_escapes: false },
    { text: decoded, decoded_escapes: true },
  ];
}
