import { DatabaseSync } from "node:sqlite";
import { pathExists } from "../util/fs.js";

export interface RtkCommandStats {
  max_id: number;
  commands: number;
  input_tokens: number;
  output_tokens: number;
  saved_tokens: number;
  savings_pct: number;
}

export const EMPTY_RTK_COMMAND_STATS: RtkCommandStats = {
  max_id: 0,
  commands: 0,
  input_tokens: 0,
  output_tokens: 0,
  saved_tokens: 0,
  savings_pct: 0,
};

export async function readRtkCommandStats(dbPath: string, sinceId = 0): Promise<RtkCommandStats> {
  if (!(await pathExists(dbPath))) {
    return { ...EMPTY_RTK_COMMAND_STATS };
  }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commands'").get();
    if (!table) {
      return { ...EMPTY_RTK_COMMAND_STATS };
    }
    const max = db.prepare("SELECT COALESCE(MAX(id), 0) AS max_id FROM commands").get() as { max_id?: number | bigint } | undefined;
    const row = db
      .prepare(
        `SELECT
          COUNT(*) AS commands,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(saved_tokens), 0) AS saved_tokens
        FROM commands
        WHERE id > ?`,
      )
      .get(Math.max(0, Math.trunc(sinceId))) as
      | {
          commands?: number | bigint;
          input_tokens?: number | bigint;
          output_tokens?: number | bigint;
          saved_tokens?: number | bigint;
        }
      | undefined;
    const input = numeric(row?.input_tokens);
    const saved = numeric(row?.saved_tokens);
    return {
      max_id: numeric(max?.max_id),
      commands: numeric(row?.commands),
      input_tokens: input,
      output_tokens: numeric(row?.output_tokens),
      saved_tokens: saved,
      savings_pct: input > 0 ? (saved / input) * 100 : 0,
    };
  } catch {
    return { ...EMPTY_RTK_COMMAND_STATS };
  } finally {
    db?.close();
  }
}

function numeric(value: number | bigint | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
