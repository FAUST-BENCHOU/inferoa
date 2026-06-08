#!/usr/bin/env node
import { serveDaemon } from "./supervisor.js";

const args = process.argv.slice(2);
const stateIndex = args.indexOf("--state-dir");
const stateDir = stateIndex >= 0 ? args[stateIndex + 1] : undefined;
const once = args.includes("--once");

serveDaemon({ stateDir, once }).catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
