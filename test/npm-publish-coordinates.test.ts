import test from "node:test";
import assert from "node:assert/strict";
import { resolveNpmPublishCoordinates } from "../src/release/npm-publish-coordinates.js";

const pkg = { name: "inferoa", version: "0.10.0" };

test("main pushes publish unique npm dev versions", () => {
  const coordinates = resolveNpmPublishCoordinates(pkg, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
    GITHUB_RUN_NUMBER: "42",
    GITHUB_SHA: "abcdef1234567890",
  });

  assert.deepEqual(coordinates, {
    name: "inferoa",
    version: "0.10.0",
    publish_version: "0.10.0-dev.42.abcdef1",
    dist_tag: "dev",
  });
});

test("version tags publish stable latest versions", () => {
  const coordinates = resolveNpmPublishCoordinates(pkg, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/tags/v0.10.0",
    GITHUB_RUN_NUMBER: "43",
    GITHUB_SHA: "abcdef1234567890",
  });

  assert.deepEqual(coordinates, {
    name: "inferoa",
    version: "0.10.0",
    publish_version: "0.10.0",
    dist_tag: "latest",
  });
});

test("version tag must match package version", () => {
  assert.throws(
    () => resolveNpmPublishCoordinates(pkg, {
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/tags/v0.10.1",
      GITHUB_RUN_NUMBER: "44",
      GITHUB_SHA: "abcdef1234567890",
    }),
    /Tag v0\.10\.1 does not match package version 0\.10\.0/,
  );
});
