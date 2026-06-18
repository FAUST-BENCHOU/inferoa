import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { renderHomeFrame } from "../src/tui/home.js";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";

const workspaceRoot = path.join(os.homedir(), "local-workbench/work/vllm/inferoa");

test("home banner omits border title without recent sessions or tagline", () => {
  const rendered = renderHomeFrame({
    workspaceRoot,
    mode: "direct",
    model: "tke/deepseek-v4-pro-tokenhub",
    width: 120,
  }).join("\n");
  const plain = stripAnsi(rendered);
  const firstLine = plain.split("\n")[0] ?? "";

  assert.match(firstLine, /^╭─+╮$/);
  assert.match(plain, />_ Inferoa/);
  assert.match(plain, /Welcome back!/);
  assert.match(plain, /Inference-native Tokenmaxxing Loop Agent Harness/);
  assert.match(rendered, /\x1b\[1m\x1b\[38;5;252mI\x1b\[0m\x1b\[38;5;244mnference-native/);
  assert.match(rendered, /\x1b\[1m\x1b\[38;5;252mT\x1b\[0m\x1b\[38;5;244mokenmaxxing/);
  assert.match(rendered, /\x1b\[1m\x1b\[38;5;252mL\x1b\[0m\x1b\[38;5;244moop/);
  assert.match(rendered, /\x1b\[1m\x1b\[38;5;252mA\x1b\[0m\x1b\[38;5;244mgent/);
  assert.match(rendered, /\x1b\[1m\x1b\[38;5;252mH\x1b\[0m\x1b\[38;5;244marness/);
  assert.doesNotMatch(plain, /Loop Engineering Agent Harness/);
  assert.match(plain, /Tips for getting started/);
  assert.match(plain, /vLLM native · tke\/deepseek-v4-pro-tokenhub/);
  assert.match(plain, /\/ commands/);
  assert.match(plain, /\$ skills/);
  assert.match(plain, /Esc interrupt the active loop/);
  assert.doesNotMatch(plain, /Agent inference-native coding/);
  assert.doesNotMatch(plain, /Recent/);
  assert.doesNotMatch(plain, /No recent sessions/);
  assert.doesNotMatch(plain, /\/setup/);
  assert.doesNotMatch(plain, /\/tools/);
  assert.doesNotMatch(plain, /Shortcuts/);
  assert.match(rendered, /\x1b\[38;5;244m~\/local-workbench\/work\/vllm\/inferoa/);
  assert.match(rendered, /\x1b\[38;5;39mtke\/deepseek-v4-pro-tokenhub/);
});

test("home banner contracts to narrow terminal widths", () => {
  const width = 58;
  const rendered = renderHomeFrame({
    workspaceRoot,
    mode: "direct",
    model: "tke/deepseek-v4-pro-tokenhub",
    width,
  });

  assert.ok(rendered.every((line) => visibleWidth(line) <= width));
  const plain = stripAnsi(rendered.join("\n"));
  assert.match(plain.split("\n")[0] ?? "", /^╭─+╮$/);
  assert.match(plain, />_ Inferoa/);
});

test("home banner caps wide terminal width instead of spanning the whole row", () => {
  const width = 168;
  const rendered = renderHomeFrame({
    workspaceRoot,
    mode: "direct",
    model: "tke/deepseek-v4-pro-tokenhub",
    width,
  });
  const frameWidth = visibleWidth(rendered[0] ?? "");

  assert.ok(frameWidth >= 84, `banner was too narrow at ${frameWidth}`);
  assert.ok(frameWidth <= 100, `banner was too wide at ${frameWidth}`);
  assert.ok(rendered.every((line) => visibleWidth(line) === frameWidth));
});

test("home banner balances wide two-column layout instead of squeezing the identity column", () => {
  const width = 204;
  const rendered = renderHomeFrame({
    workspaceRoot,
    mode: "auto",
    model: "qwen/qwen3.6-rocm",
    width,
  });
  const frameWidth = visibleWidth(rendered[0] ?? "");
  const plainLines = rendered.map((line) => stripAnsi(line));
  const dividerColumns = plainLines
    .flatMap((line) => [...line.matchAll(/│/g)].map((match) => match.index ?? -1))
    .filter((index) => index > 1 && index < frameWidth - 2);
  const bodyDividerColumn = dividerColumns[0] ?? -1;
  const tipsLine = plainLines.find((line) => line.includes("Tips for getting started")) ?? "";

  assert.ok(frameWidth >= 96, `banner was too narrow at ${frameWidth}`);
  assert.ok(frameWidth <= 112, `banner was too wide at ${frameWidth}`);
  assert.ok(rendered.every((line) => visibleWidth(line) === frameWidth));
  assert.ok(bodyDividerColumn >= 52, `divider was too far left at ${bodyDividerColumn}`);
  assert.ok(bodyDividerColumn <= 72, `divider was too far right at ${bodyDividerColumn}`);
  assert.match(tipsLine.slice(bodyDividerColumn + 1), /Tips for getting started/);
  assert.match(plainLines.join("\n"), /~\/local-workbench\/work\/vllm\/inferoa/);
  assert.doesNotMatch(plainLines.join("\n"), /local-workbench\/work\/vll…/);
});
