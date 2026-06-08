import test from "node:test";
import assert from "node:assert/strict";
import { MarkdownStreamRenderer, renderMarkdown } from "../src/tui/markdown.js";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";

test("markdown renderer formats common transcript markdown", () => {
  const rendered = renderMarkdown(
    [
      "# Plan",
      "- inspect `src/tui/app.ts`",
      "- [x] stream markdown",
      "> keep output compact",
      "See [docs](docs/roadmap.md) and **finish**.",
      "```ts",
      "const ok = true;",
      "```",
    ].join("\n"),
    { width: 56 },
  );
  const plain = stripAnsi(rendered);
  assert.match(plain, /Plan/);
  assert.match(plain, /• inspect src\/tui\/app\.ts/);
  assert.match(plain, /\[x\] stream markdown/);
  assert.match(plain, /▌ keep output compact/);
  assert.match(plain, /docs docs\/roadmap\.md and finish\./);
  assert.match(plain, /╭─ ts/);
  assert.match(plain, /const ok = true;/);
});

test("markdown renderer makes simple tables readable", () => {
  const rendered = renderMarkdown("| Tool | Description |\n| --- | --- |\n| **read_file** | Read `file` windows |\n", { width: 48 });
  const plain = stripAnsi(rendered);
  assert.match(plain, /Tool\s+│\s+Description/);
  assert.match(plain, /read_file\s+│\s+Read file windows/);
  assert.doesNotMatch(plain, /\*\*read_file\*\*/);
  assert.match(rendered, /\x1b\[1m/);
  assert.doesNotMatch(plain, /^\| Tool/m);
});

test("markdown renderer handles pipe tables without outer borders", () => {
  const rendered = renderMarkdown("Tool | Description\n--- | ---\n**apply_patch** | Apply `diff`\n", { width: 48 });
  const plain = stripAnsi(rendered);
  assert.match(plain, /Tool\s+│\s+Description/);
  assert.match(plain, /apply_patch\s+│\s+Apply diff/);
  assert.doesNotMatch(plain, /\*\*apply_patch\*\*/);
  assert.match(rendered, /\x1b\[1m/);
});

test("markdown stream renderer flushes long partial lines and wraps to width", () => {
  const renderer = new MarkdownStreamRenderer({ width: 34, partialFlushColumns: 24 });
  const first = renderer.write("This is a long streaming paragraph with ");
  const second = renderer.write("more content and no newline yet");
  const flushed = first + second + renderer.flush();
  const lines = stripAnsi(flushed).split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 34, line);
  }
});

test("markdown stream renderer waits for complete table rows before rendering inline styles", () => {
  const renderer = new MarkdownStreamRenderer({ width: 64, partialFlushColumns: 12 });
  const first = renderer.write("| Tool | Description |");
  assert.equal(first, "");
  const rendered = first + renderer.write("\n| --- | --- |\n| **apply_patch** | Apply `diff` |\n");
  const plain = stripAnsi(rendered);
  assert.match(plain, /apply_patch\s+│\s+Apply diff/);
  assert.doesNotMatch(plain, /\*\*apply_patch\*\*/);
  assert.match(rendered, /\x1b\[1m/);
});

test("markdown table styling survives narrow wrapping", () => {
  const rendered = renderMarkdown("| Tool | Description |\n| --- | --- |\n| **very_long_tool_name_that_wraps** | Read `file` windows |\n", { width: 30 });
  const plain = stripAnsi(rendered);
  assert.doesNotMatch(plain, /\*\*/);
  assert.match(plain, /very_long/);
  assert.match(rendered, /\x1b\[1m/);
});

test("markdown table renderer strips dangling inline markers after wrapping", () => {
  const rendered = renderMarkdown(
    "| Tool | Description |\n| --- | --- |\n| **apply_patch** | Apply a unified diff patch with **bold detail that gets cut** |\n",
    { width: 36 },
  );
  const plain = stripAnsi(rendered);
  assert.doesNotMatch(plain, /\*\*/);
  assert.match(plain, /apply_patch/);
});

test("markdown table renderer wraps long cells instead of truncating content", () => {
  const rendered = renderMarkdown(
    [
      "| Finding | Highlight |",
      "| --- | --- |",
      "| **Inference Co-Designed Cache** | Real empirical experiments proving 99% prefix-cache hit rates, no idle timeout, tool-order stability, and session-aware evidence. |",
      "| **Autoresearch** | Self-improvement framework: define experiments, run harness, track primary metrics, auto-keep best results, and record reproducible notes. |",
    ].join("\n"),
    { width: 72 },
  );
  const plain = stripAnsi(rendered);
  const lines = plain.split(/\r?\n/).filter(Boolean);

  assert.ok(lines.every((line) => visibleWidth(line) <= 72), lines.join("\n"));
  assert.doesNotMatch(plain, /…/);
  assert.match(plain, /Inference Co-Designed Cache/);
  assert.match(plain, /tool-order stability/);
  assert.match(plain, /session-aware/);
  assert.match(plain, /evidence/);
  assert.match(plain, /auto-keep best results/);
});
