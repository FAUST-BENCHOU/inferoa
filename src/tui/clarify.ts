import type { ClarifyRequest, ClarifyResponse } from "../types.js";
import { bgLine, fg256, truncateToWidth, visibleWidth } from "./ansi.js";
import type { ComposerPanel } from "./composer.js";

export interface ClarifyInputState {
  value: string;
  selectedIndex: number;
}

export interface ClarifyInputResult {
  state: ClarifyInputState;
  response?: ClarifyResponse;
  cancelled?: boolean;
}

export function createClarifyInputState(request: ClarifyRequest): ClarifyInputState {
  return {
    value: "",
    selectedIndex: request.choices.length ? 0 : -1,
  };
}

export function applyClarifyInputToken(state: ClarifyInputState, request: ClarifyRequest, key: string): ClarifyInputResult {
  const next = normalizeClarifyState(state, request);
  if (key === "\u0003" || key === "\u001b") {
    return { state: next, cancelled: true };
  }
  if (key === "\u007f") {
    return {
      state: {
        ...next,
        value: next.value.slice(0, -1),
      },
    };
  }
  if (key === "\u001b[A") {
    return { state: moveSelection(next, request, -1) };
  }
  if (key === "\u001b[B") {
    return { state: moveSelection(next, request, 1) };
  }
  const numericChoice = immediateNumericChoice(next, request, key);
  if (numericChoice) {
    return { state: next, response: responseForChoice(numericChoice) };
  }
  if (key === "\r" || key === "\n") {
    const answer = next.value.trim();
    const enteredChoice = choiceFromExactNumericAnswer(request, answer);
    if (enteredChoice) {
      return { state: next, response: responseForChoice(enteredChoice) };
    }
    if (!answer && next.selectedIndex >= 0) {
      const choice = request.choices[next.selectedIndex];
      if (choice) {
        return { state: next, response: responseForChoice(choice) };
      }
    }
    if (!answer || !request.allow_freeform) {
      return { state: next };
    }
    return {
      state: next,
      response: { answer, freeform: true },
    };
  }
  const printable = printableClarifyText(key);
  if (!printable) {
    return { state: next };
  }
  return {
    state: {
      ...next,
      value: next.value + printable,
    },
  };
}

export function renderClarifyComposerPanel(request: ClarifyRequest, state: ClarifyInputState, width: number): ComposerPanel {
  const safeWidth = Math.max(32, width);
  const contentWidth = Math.max(12, safeWidth - 6);
  const lines: string[] = [];
  const push = (text = "") => lines.push(bgLine(236, text, safeWidth));

  push(`  ${fg256(75, "▌")} ${fg256(39, "clarify")} ${fg256(244, "needs your response")}`);
  push("");
  for (const line of wrapClarifyText(request.question, contentWidth)) {
    push(`  ${fg256(252, line)}`);
  }
  if (request.details) {
    for (const line of wrapClarifyText(request.details, contentWidth)) {
      push(`  ${fg256(244, line)}`);
    }
  }
  if (request.choices.length) {
    push("");
    request.choices.forEach((choice, index) => {
      const active = index === state.selectedIndex && !state.value;
      const marker = active ? fg256(75, "›") : fg256(244, " ");
      const hotkey = active ? fg256(75, `[${index + 1}]`) : fg256(244, `[${index + 1}]`);
      const description = choice.description ? ` ${choice.description}` : "";
      const wrapped = wrapClarifyText(`${choice.label}${description}`, Math.max(8, contentWidth - 7));
      const first = wrapped[0] ?? "";
      const labelPart = first.startsWith(choice.label) ? choice.label : first;
      const detailPart = first.startsWith(choice.label) ? first.slice(choice.label.length).trimStart() : "";
      push(`  ${marker} ${hotkey} ${active ? fg256(252, labelPart) : fg256(250, labelPart)}${detailPart ? ` ${fg256(244, detailPart)}` : ""}`);
      for (const continuation of wrapped.slice(1)) {
        push(`       ${fg256(244, continuation)}`);
      }
    });
  }

  push("");
  const inputLine = lines.length;
  const prefix = "› ";
  const placeholder = request.placeholder ?? (request.allow_freeform ? "type an answer or choose a number" : "choose a number");
  const display = state.value ? truncateToWidth(state.value, Math.max(1, contentWidth - visibleWidth(prefix))) : fg256(244, placeholder);
  push(`  ${prefix}${display}`);
  push(`  ${fg256(244, request.allow_freeform ? "↑/↓ choose · enter submit · number choose · esc cancel" : "↑/↓ choose · enter/number select · esc cancel")}`);

  return {
    lines,
    cursorLine: inputLine,
    cursorColumn: state.value ? 2 + visibleWidth(prefix) + visibleWidth(display) : 2 + visibleWidth(prefix),
  };
}

function normalizeClarifyState(state: ClarifyInputState, request: ClarifyRequest): ClarifyInputState {
  if (!request.choices.length) {
    return { value: state.value, selectedIndex: -1 };
  }
  return {
    value: state.value,
    selectedIndex: Math.max(0, Math.min(state.selectedIndex < 0 ? 0 : state.selectedIndex, request.choices.length - 1)),
  };
}

function moveSelection(state: ClarifyInputState, request: ClarifyRequest, delta: number): ClarifyInputState {
  if (!request.choices.length) {
    return { ...state, selectedIndex: -1 };
  }
  return {
    ...state,
    selectedIndex: (state.selectedIndex + delta + request.choices.length) % request.choices.length,
  };
}

function immediateNumericChoice(state: ClarifyInputState, request: ClarifyRequest, key: string): ClarifyRequest["choices"][number] | undefined {
  if (state.value || !/^[1-9]$/.test(key)) {
    return undefined;
  }
  return request.choices[Number.parseInt(key, 10) - 1];
}

function choiceFromExactNumericAnswer(request: ClarifyRequest, answer: string): ClarifyRequest["choices"][number] | undefined {
  if (!/^[1-9][0-9]*$/.test(answer)) {
    return undefined;
  }
  return request.choices[Number.parseInt(answer, 10) - 1];
}

function responseForChoice(choice: ClarifyRequest["choices"][number]): ClarifyResponse {
  return {
    answer: choice.label,
    choice_id: choice.id,
    choice_label: choice.label,
    freeform: false,
  };
}

function printableClarifyText(value: string): string {
  return [...value].filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x20 && code !== 0x7f && code !== 0x1b;
  }).join("");
}

function wrapClarifyText(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width);
  const lines: string[] = [];
  let current = "";
  const tokens = text.replace(/\s+/g, " ").trim().match(/[^\x00-\x7F]|[!-~]+| +/g) ?? [];
  for (const token of tokens) {
    if (token === " " && !current) {
      continue;
    }
    if (visibleWidth(token) > safeWidth) {
      if (current.trimEnd()) {
        lines.push(current.trimEnd());
        current = "";
      }
      for (const char of [...token]) {
        if (visibleWidth(current + char) > safeWidth && current) {
          lines.push(current);
          current = char.trimStart();
          continue;
        }
        current += char;
      }
      continue;
    }
    if (visibleWidth(current + token) > safeWidth && current) {
      lines.push(current.trimEnd());
      current = token.trimStart();
      continue;
    }
    current += token;
  }
  if (current.trimEnd()) {
    lines.push(current.trimEnd());
  }
  return lines.length ? lines : [""];
}
