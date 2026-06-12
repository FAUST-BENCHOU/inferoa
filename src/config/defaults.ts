import type { VllmAgentConfig } from "../types.js";

export const DEFAULT_CONFIG: VllmAgentConfig = {
  model_setup: {
    mode: "direct",
    provider: "vllm",
    base_url: "http://localhost:8000/v1",
    context_window: 256_000,
  },
  model_retry: {
    initial_delay_ms: 1000,
    max_delay_ms: 60_000,
    backoff_factor: 2,
    jitter_ratio: 0.2,
    request_timeout_ms: 300_000,
  },
  omni: {
    enabled: false,
    endpoints: {},
  },
  permissions: {
    mode: "full_access",
  },
  context: {
    compression_threshold: 0.75,
    context_window: 256_000,
    auto_compact_failure_limit: 3,
    compact_recent_file_limit: 5,
    compact_recent_file_token_limit: 5_000,
    compact_recent_total_token_limit: 25_000,
    protected_recent_loops: 3,
    engine: {
      provider: "auto",
      startup: "welcome",
      require_ready_before_chat: true,
      watch: true,
    },
  },
  skills: {
    enabled: ["coding-workflow"],
    managed_installs: "ask",
  },
  web_search: {
    provider: "auto",
  },
  rtk: {
    enabled: true,
    delivery: "managed",
    version: "0.42.3",
    auto_download: true,
  },
  daemon: {
    poll_ms: 1000,
  },
  loop: {
    default_background_isolation: "active_checkout",
  },
};
