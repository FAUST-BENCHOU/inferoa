export interface ComposerResizeEraseInput {
  renderedCursorLine: number;
  renderedCursorColumn: number;
  renderedWidth: number;
  terminalWidth: number;
}

export function composerEraseRowsForResize(input: ComposerResizeEraseInput): number {
  const terminalWidth = positiveInteger(input.terminalWidth, 1);
  const renderedWidth = positiveInteger(input.renderedWidth, terminalWidth);
  const cursorLine = positiveInteger(input.renderedCursorLine, 0);
  const cursorColumn = positiveInteger(input.renderedCursorColumn, 0);
  const physicalRowsPerRenderedLine = Math.max(1, Math.ceil(renderedWidth / terminalWidth));
  return cursorLine * physicalRowsPerRenderedLine + Math.floor(cursorColumn / terminalWidth);
}

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}
