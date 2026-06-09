import test from "node:test";
import assert from "node:assert/strict";
import { renderInferoaSplash } from "../src/tui/splash.js";
import { stripAnsi, visibleWidth } from "../src/tui/ansi.js";

test("splash renders the inference-native identity without the old tagline", () => {
  const rendered = renderInferoaSplash(650, 160, 32).join("\n");
  const plain = stripAnsi(rendered);
  assert.match(plain, /Inferoa/);
  assert.match(plain, /Inference-native Tokenmaxxing Agent Harness/);
  assert.doesNotMatch(plain, /Inferoa inference-native coding/);
  assert.doesNotMatch(plain, /Agent inference-native coding/);
  assert.match(plain, /██████╗  ██████╗  █████╗/);
  assert.match(rendered, /\x1b\[38;5;39m/);
  assert.doesNotMatch(rendered, /\x1b\[38;5;214m/);

  const lines = plain.split("\n");
  const meter = lines.find((line) => /[━─]{22,}/.test(line));
  assert.ok(meter, "expected splash meter");
  const meterStart = meter.search(/[━─]/);
  const meterWidth = visibleWidth((meter.match(/[━─]+/) ?? [""])[0]);
  const logoLine = lines.find((line) => line.includes("██████╗  ██████╗  █████╗"));
  assert.ok(logoLine, "expected logo line");
  const logoStart = logoLine.search(/\S/);
  const logoWidth = visibleWidth(logoLine.trimEnd()) - logoStart;
  const expectedStart = logoStart + Math.floor((logoWidth - meterWidth) / 2);
  assert.ok(Math.abs(meterStart - expectedStart) <= 4, `meter start ${meterStart} expected ${expectedStart}`);
});
