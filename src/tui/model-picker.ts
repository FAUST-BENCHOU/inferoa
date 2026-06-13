import { fg256 } from "./ansi.js";

export type ModelProbeSource = "live" | "fallback" | "manual";

export interface ModelPickerHintOptions {
  pageIndex: number;
  totalPages: number;
  totalItems: number;
  query?: string;
  source?: ModelProbeSource;
}

export function modelPickerHint(options: ModelPickerHintOptions): string {
  const segments = [
    fg256(244, `${options.pageIndex + 1}/${options.totalPages}`),
    fg256(244, `${options.totalItems} models`),
  ];
  const query = options.query?.trim();
  if (query) {
    segments.push(fg256(244, `search ${query}`));
  }
  const source = modelProbeSourceBadge(options.source);
  if (source) {
    segments.push(source);
  }
  segments.push(fg256(244, "←/→ page"));
  segments.push(fg256(244, "type search"));
  segments.push(fg256(244, "enter select"));
  segments.push(fg256(244, "esc cancel"));
  return segments.join(fg256(244, " · "));
}

function modelProbeSourceBadge(source: ModelProbeSource | undefined): string | undefined {
  if (source === "live") {
    return fg256(48, "live");
  }
  if (source === "fallback") {
    return fg256(178, "fallback");
  }
  if (source === "manual") {
    return fg256(244, "manual");
  }
  return undefined;
}
