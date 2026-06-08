import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config/defaults.js";
import { TuiApp } from "../src/tui/app.js";

test("setup save returns to welcome surface", async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "inferoa-setup-welcome-"));
  const previousStateDir = process.env.INFEROA_STATE_DIR;
  const originalStdoutWrite = process.stdout.write;
  process.env.INFEROA_STATE_DIR = stateDir;
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    const tui = new TuiApp(
      {
        config,
        configFiles: [],
        workspace: { id: "w_setup_welcome", root: stateDir, alias: "setup-welcome" },
        store: { close() {} },
        runtime: {},
      } as never,
    );
    const view = tui as unknown as {
      enterChatSurfaceFromWelcome: () => void;
      renderSetupView: () => Promise<void>;
      renderCenteredPanel: () => void;
      prepareRtkForSetup: (nextConfig: typeof config) => Promise<unknown>;
      chooseProvider: () => Promise<"direct">;
      askRequired: () => Promise<string>;
      askApiKeySelection: () => Promise<{ api_key_ref?: string }>;
      probeChatModels: () => Promise<{ models: string[]; errors: string[] }>;
      pickModel: () => Promise<string>;
      ask: () => Promise<string>;
      configureWebSearch: (nextConfig: typeof config) => Promise<void>;
      confirm: () => Promise<boolean>;
      reviewSetupBeforeSave: () => Promise<boolean>;
      renderPanel: (title: string, body: string[]) => void;
      renderHome: () => void;
      writeHomeFrame: () => void;
      shouldRenderWelcomeComposer: () => boolean;
    };
    const renderedPanels: string[] = [];
    let homeRendered = false;

    view.renderCenteredPanel = () => {};
    view.writeHomeFrame = () => {};
    let rtkPrepared = false;
    view.prepareRtkForSetup = async () => {
      rtkPrepared = true;
      return { enabled: true, available: true, source: "config", version: "0.42.3", delivery: "path_only", auto_download: false };
    };
    view.chooseProvider = async () => "direct";
    view.askRequired = async () => "https://api.agrun.woa.com/v1";
    view.askApiKeySelection = async () => ({ api_key_ref: undefined });
    view.probeChatModels = async () => ({ models: ["tke/deepseek-v4-pro-tokenhub"], errors: [] });
    view.pickModel = async () => "tke/deepseek-v4-pro-tokenhub";
    view.ask = async () => "1024000";
    view.configureWebSearch = async (nextConfig) => {
      nextConfig.web_search.provider = "auto";
    };
    view.confirm = async () => false;
    view.reviewSetupBeforeSave = async () => true;
    view.renderPanel = (title) => {
      renderedPanels.push(title);
    };
    view.renderHome = () => {
      homeRendered = true;
    };

    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      view.enterChatSurfaceFromWelcome();
      assert.equal(view.shouldRenderWelcomeComposer(), false);

      await view.renderSetupView();
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    assert.equal(homeRendered, true);
    assert.equal(rtkPrepared, true);
    assert.deepEqual(renderedPanels, []);
    assert.equal(view.shouldRenderWelcomeComposer(), true);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.INFEROA_STATE_DIR;
    } else {
      process.env.INFEROA_STATE_DIR = previousStateDir;
    }
    await rm(stateDir, { recursive: true, force: true });
  }
});
