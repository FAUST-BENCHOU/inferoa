import { constants, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

export function homeStateDir(): string {
  return path.join(os.homedir(), ".inferoa");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(command: string): Promise<boolean> {
  const result = await runSmallCommand("command", ["-v", command], process.cwd(), 2000);
  return result.code === 0;
}

export async function realpathOrResolve(target: string): Promise<string> {
  try {
    return await fs.realpath(target);
  } catch {
    return path.resolve(target);
  }
}

export async function findGitRoot(cwd: string): Promise<string | undefined> {
  const result = await runSmallCommand("git", ["rev-parse", "--show-toplevel"], cwd, 2000);
  if (result.code === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  return undefined;
}

export async function runSmallCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: command === "command" });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: String(error) });
    });
  });
}

export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function resolveInside(base: string, requested: string): string {
  const normalizedRequest = requested.trim() === "/" ? "." : requested;
  const resolved = path.resolve(base, normalizedRequest);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${requested}`);
  }
  return resolved;
}
