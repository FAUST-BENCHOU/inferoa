import type { AppOptions } from "../app.js";
import type { JsonObject } from "../types.js";
import { runAgenticRoutingEval } from "../debug/agentic-routing-eval.js";

export interface EvalRunResult {
  report: JsonObject;
  failed: boolean;
}

interface EvalProfileRunner {
  profile: string;
  description: string;
  run: (options: AppOptions, args: string[]) => Promise<EvalRunResult>;
}

const EVAL_PROFILES: EvalProfileRunner[] = [
  {
    profile: "agentic-routing",
    description: "Evaluate vLLM SR agentic routing, SAAR replay diagnostics, and cache-aware cost.",
    run: runAgenticRoutingEval,
  },
];

export async function runEvalProfile(options: AppOptions, args: string[]): Promise<EvalRunResult> {
  const parsed = parseEvalArgs(args);
  if (parsed.list) {
    return {
      failed: false,
      report: {
        profiles: EVAL_PROFILES.map((profile) => ({
          profile: profile.profile,
          description: profile.description,
        })),
      },
    };
  }
  const profile = parsed.profile ?? "agentic-routing";
  const runner = EVAL_PROFILES.find((candidate) => candidate.profile === profile);
  if (!runner) {
    throw new Error(`Unknown eval profile: ${profile}`);
  }
  return runner.run(options, parsed.profileArgs);
}

function parseEvalArgs(args: string[]): { profile?: string; profileArgs: string[]; list: boolean } {
  const profileArgs: string[] = [];
  let profile: string | undefined;
  let list = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--profile") {
      profile = requiredValue(args, ++index, arg);
      continue;
    }
    if (arg.startsWith("--profile=")) {
      profile = arg.slice("--profile=".length);
      if (!profile) {
        throw new Error("--profile requires a value");
      }
      continue;
    }
    if (!arg.startsWith("--") && !profile) {
      profile = arg;
      continue;
    }
    profileArgs.push(arg);
  }

  return { profile, profileArgs, list };
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}
