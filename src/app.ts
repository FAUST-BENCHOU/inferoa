import { loadConfig } from "./config/config.js";
import { resolveWorkspace } from "./session/workspace.js";
import { SessionStore } from "./session/store.js";
import { Runtime } from "./runtime.js";

export interface AppOptions {
  config?: string;
  workspace?: string;
  stateDir?: string;
}

export async function loadApp(options: AppOptions = {}): Promise<{
  config: Awaited<ReturnType<typeof loadConfig>>["config"];
  configFiles: string[];
  workspace: Awaited<ReturnType<typeof resolveWorkspace>>;
  store: SessionStore;
  runtime: Runtime;
}> {
  if (options.stateDir) {
    process.env.INFEROA_STATE_DIR = options.stateDir;
  }
  const { config, files } = await loadConfig(process.cwd(), options.config);
  const workspace = await resolveWorkspace(process.cwd(), config, options.workspace);
  const store = await SessionStore.open(options.stateDir);
  store.clearStaleLocks();
  store.upsertWorkspace(workspace);
  const runtime = new Runtime(config, workspace, store);
  return { config, configFiles: files, workspace, store, runtime };
}
