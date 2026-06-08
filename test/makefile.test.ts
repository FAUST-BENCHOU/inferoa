import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Makefile exposes a dev-bin target that builds and links inferoa", async () => {
  const makefile = await readFile("Makefile", "utf8");

  assert.match(makefile, /^dev-bin:/m);
  assert.match(makefile, /\bnpm run build\b/);
  assert.match(makefile, /\bchmod \+x dist\/src\/cli\.js\b/);
  assert.match(makefile, /\bnpm link\b/);
});

test("Makefile exposes docs preview targets for the website", async () => {
  const makefile = await readFile("Makefile", "utf8");

  assert.match(makefile, /^docs-preview:/m);
  assert.match(makefile, /\bnpm run site:start\b/);
  assert.match(makefile, /^docs-build:/m);
  assert.match(makefile, /\bnpm run site:build\b/);
  assert.match(makefile, /^docs-serve:/m);
  assert.match(makefile, /\bnpm run site:serve\b/);
});
