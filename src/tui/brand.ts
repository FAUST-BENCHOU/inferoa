import { ansi, fg256 } from "./ansi.js";

export const INFEROA_TAGLINE = "Inference-native Tokenmaxxing Loop Agent Harness";

export function renderInferoaTagline(): string {
  return INFEROA_TAGLINE.split(" ").map(renderTaglineWord).join(" ");
}

function renderTaglineWord(word: string): string {
  const [initial = "", ...rest] = [...word];
  if (!initial) {
    return "";
  }
  return `${ansi.bold}${fg256(252, initial)}${fg256(244, rest.join(""))}`;
}
