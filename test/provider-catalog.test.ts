import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverExternalProviderStates,
  externalProviderById,
  externalProviderSetupOptions,
  probeExternalProviderModels,
} from "../src/model/providers.js";

test("external provider setup options put discovered providers first", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-provider-discovery-"));
  try {
    await mkdir(path.join(homeDir, ".codex"), { recursive: true });
    await writeFile(
      path.join(homeDir, ".codex", "auth.json"),
      JSON.stringify({
        tokens: {
          access_token: futureJwt(),
          refresh_token: "refresh-token",
        },
      }),
      "utf8",
    );

    const states = await discoverExternalProviderStates({
      homeDir,
      env: { OPENROUTER_API_KEY: "sk-or-test" },
      runCommand: async () => "",
    });
    const options = externalProviderSetupOptions(states);

    assert.equal(options[0]?.provider.id, "openai-codex");
    assert.equal(options[0]?.discovered, true);
    assert.match(options[0]?.description ?? "", /discovered/i);

    const openrouter = options.find((option) => option.provider.id === "openrouter");
    assert.equal(openrouter?.discovered, true);
    assert.match(openrouter?.description ?? "", /env:OPENROUTER_API_KEY/);

    const openaiCompatibleIndex = options.findIndex((option) => option.provider.id === "openai-compatible");
    assert.ok(openaiCompatibleIndex > 0);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("tensormesh is the first built-in OpenAI-compatible provider", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-tensormesh-catalog-"));
  try {
    const states = await discoverExternalProviderStates({
      homeDir,
      env: {},
      runCommand: async () => "",
    });
    const options = externalProviderSetupOptions(states);
    const tensormesh = externalProviderById("tensormesh");

    assert.ok(tensormesh);
    assert.deepEqual(options.slice(0, 3).map((option) => option.provider.id), ["openai-compatible", "tensormesh", "openai"]);
    assert.equal(tensormesh.label, "Tensormesh");
    assert.equal(tensormesh.description, "KV-cache inference for faster, lower-cost agents");
    assert.equal(tensormesh.base_url, "https://serverless.tensormesh.ai/v1");
    assert.equal(tensormesh.profile, "openai_compatible");
    assert.equal(tensormesh.default_model, "MiniMaxAI/MiniMax-M2.5");
    assert.deepEqual(tensormesh.env_var_names, ["TENSORMESH_INFERENCE_API_KEY", "TENSORMESH_API_KEY"]);
    assert.deepEqual(tensormesh.model_hints.slice(0, 4), [
      "MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.5-397B-A17B-FP8",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "openai/gpt-oss-120b",
    ]);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("tensormesh discovery uses inference env key and serverless model catalog", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-tensormesh-discovery-"));
  try {
    const states = await discoverExternalProviderStates({
      homeDir,
      env: { TENSORMESH_INFERENCE_API_KEY: "ak-live-test" },
      runCommand: async () => "",
    });
    const options = externalProviderSetupOptions(states);
    const tensormesh = externalProviderById("tensormesh");
    assert.ok(tensormesh);

    assert.equal(options[0]?.provider.id, "tensormesh");
    assert.equal(options[0]?.discovered, true);
    assert.match(options[0]?.description ?? "", /env:TENSORMESH_INFERENCE_API_KEY/);

    const requests: Array<{ url: string; authorization?: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(url), authorization: headers.get("authorization") });
      return new Response(JSON.stringify({ data: [{ id: "MiniMaxAI/MiniMax-M2.5" }, { id: "openai/gpt-oss-120b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await probeExternalProviderModels(tensormesh, { apiKey: "ak-live-test" });
      assert.deepEqual(result.models.slice(0, 2), ["MiniMaxAI/MiniMax-M2.5", "openai/gpt-oss-120b"]);
      assert.equal(result.source, "live");
      assert.equal(result.errors.length, 0);
      assert.deepEqual(requests, [{
        url: "https://serverless.tensormesh.ai/v1/models",
        authorization: "Bearer ak-live-test",
      }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("tensormesh falls back to hints when live catalog is unavailable", async () => {
  const tensormesh = externalProviderById("tensormesh");
  assert.ok(tensormesh);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND bad.example"), { code: "ENOTFOUND" });
    throw Object.assign(new TypeError("fetch failed"), { cause });
  }) as typeof fetch;
  try {
    const result = await probeExternalProviderModels(tensormesh, { apiKey: "ak-live-test" });

    assert.deepEqual(result.models.slice(0, 4), [
      "MiniMaxAI/MiniMax-M2.5",
      "Qwen/Qwen3.5-397B-A17B-FP8",
      "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8",
      "openai/gpt-oss-120b",
    ]);
    assert.equal(result.source, "fallback");
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0] ?? "", /fetch failed/);
    assert.match(result.errors[0] ?? "", /ENOTFOUND/);
    assert.match(result.errors[0] ?? "", /bad\.example/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider model probing honors provider-specific catalog payloads", async () => {
  const provider = externalProviderById("openai-codex");
  assert.ok(provider);

  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ models: [{ slug: "gpt-5.4", title: "GPT 5.4" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await probeExternalProviderModels(provider, { apiKey: "token" });
    assert.equal(result.models[0], "gpt-5.4");
    assert.ok(result.models.includes("gpt-5.4-mini"));
    assert.equal(result.errors.length, 0);
    assert.equal(urls[0], "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function futureJwt(): string {
  const header = base64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${header}.${payload}.signature`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}
