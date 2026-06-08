import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { EndpointSignals } from "../src/model/endpoint-signals.js";

test("endpoint snapshot does not probe optional tokenize during setup/status workflow", async () => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(req.url ?? "");
    if (req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "demo-model" }] }));
      return;
    }
    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(
        [
          "# HELP vllm:prefix_cache_queries_total Number of prefix cache queries",
          "vllm:prefix_cache_queries_total{model_name=\"demo-model\"} 20",
          "vllm:prefix_cache_hits_total{model_name=\"demo-model\"} 15",
          "vllm:prompt_tokens_cached_total{model_name=\"demo-model\"} 1024",
          "vllm:cache_hit_rate{model_name=\"demo-model\"} 0.75",
          "vllm:local_cache_hits_total{model_name=\"demo-model\"} 9",
          "vllm:unrelated_total 999",
        ].join("\n"),
      );
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.model_setup.base_url = `http://127.0.0.1:${address.port}/v1`;
    config.model_setup.model = "demo-model";
    const snapshot = await new EndpointSignals(config).snapshot();
    assert.deepEqual(snapshot.models?.map((model) => model.id), ["demo-model"]);
    assert.equal(snapshot.cache_metrics?.["vllm:prefix_cache_queries_total{model_name=\"demo-model\"}"], 20);
    assert.equal(snapshot.cache_metrics?.["vllm:prefix_cache_hits_total{model_name=\"demo-model\"}"], 15);
    assert.equal(snapshot.cache_metrics?.["vllm:prompt_tokens_cached_total{model_name=\"demo-model\"}"], 1024);
    assert.equal(snapshot.cache_metrics?.["vllm:cache_hit_rate{model_name=\"demo-model\"}"], 0.75);
    assert.equal(snapshot.cache_metrics?.["vllm:local_cache_hits_total{model_name=\"demo-model\"}"], 9);
    assert.equal(snapshot.cache_metrics?.["vllm:unrelated_total"], undefined);
    assert.equal(snapshot.errors?.length, 0);
    assert.ok(!seen.some((url) => url.includes("tokenize")), `unexpected tokenize probe: ${seen.join(", ")}`);
  } finally {
    server.close();
  }
});
