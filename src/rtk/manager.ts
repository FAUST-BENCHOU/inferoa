import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";
import type { RtkConfig, VllmAgentConfig } from "../types.js";
import { ensureDir, homeStateDir, pathExists, runSmallCommand } from "../util/fs.js";

export interface RtkStatus {
  enabled: boolean;
  available: boolean;
  source: "disabled" | "config" | "env" | "path" | "managed" | "unavailable";
  version: string;
  delivery: RtkConfig["delivery"];
  auto_download: boolean;
  binary_path?: string;
  error?: string;
}

export interface RtkRuntime {
  status: RtkStatus & { available: true; binary_path: string };
  bin_dir: string;
}

export interface ResolveRtkOptions {
  allowDownload?: boolean;
}

const GITHUB_API = "https://api.github.com/repos/rtk-ai/rtk/releases/tags";
const DOWNLOAD_FAILURE_TTL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;
const managedDownloadFailures = new Map<string, { error: string; at: number }>();

export async function resolveRtkStatus(config: VllmAgentConfig, options: ResolveRtkOptions = {}): Promise<RtkStatus> {
  const rtk = config.rtk;
  if (!rtk.enabled) {
    return baseStatus(rtk, "disabled", false);
  }

  const envPath = process.env.INFEROA_RTK_PATH?.trim();
  if (envPath) {
    return await binaryStatus(rtk, envPath, "env");
  }
  if (rtk.binary_path) {
    return await binaryStatus(rtk, rtk.binary_path, "config");
  }

  const pathBinary = await pathRtkBinary();
  if (pathBinary) {
    return await binaryStatus(rtk, pathBinary, "path");
  }

  if (rtk.delivery !== "managed") {
    return {
      ...baseStatus(rtk, "unavailable", false),
      error: "RTK binary was not found in PATH and managed delivery is disabled.",
    };
  }

  const managed = managedBinaryPath(rtk.version);
  if (await pathExists(managed)) {
    return await binaryStatus(rtk, managed, "managed");
  }

  if (!rtk.auto_download || !options.allowDownload) {
    return {
      ...baseStatus(rtk, "managed", false),
      binary_path: managed,
      error: rtk.auto_download ? "Managed RTK is not installed yet." : "Managed RTK auto-download is disabled.",
    };
  }

  const failureKey = `${rtk.version}:${platformAssetKey()}`;
  const recentFailure = managedDownloadFailures.get(failureKey);
  if (recentFailure && Date.now() - recentFailure.at < DOWNLOAD_FAILURE_TTL_MS) {
    return {
      ...baseStatus(rtk, "managed", false),
      binary_path: managed,
      error: recentFailure.error,
    };
  }

  try {
    await downloadManagedRtk(rtk.version, managed);
    managedDownloadFailures.delete(failureKey);
    return await binaryStatus(rtk, managed, "managed");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    managedDownloadFailures.set(failureKey, { error: message, at: Date.now() });
    return {
      ...baseStatus(rtk, "managed", false),
      binary_path: managed,
      error: message,
    };
  }
}

export async function prepareRtkRuntime(config: VllmAgentConfig, options: ResolveRtkOptions = {}): Promise<RtkRuntime | undefined> {
  const status = await resolveRtkStatus(config, options);
  if (!status.available || !status.binary_path) {
    return undefined;
  }
  return {
    status: status as RtkRuntime["status"],
    bin_dir: path.dirname(status.binary_path),
  };
}

export function rtkDbPath(sessionId: string, runId?: string): string {
  const run = runId?.replace(/[^A-Za-z0-9_.-]/g, "_") || "no-run";
  const session = sessionId.replace(/[^A-Za-z0-9_.-]/g, "_");
  return path.join(homeStateDir(), "rtk", "runs", `${session}-${run}.db`);
}

export function rtkEnv(runtime: RtkRuntime, dbPath: string, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PATH: `${runtime.bin_dir}${path.delimiter}${baseEnv.PATH ?? ""}`,
    RTK_DB_PATH: dbPath,
    RTK_TELEMETRY_DISABLED: "1",
  };
}

function baseStatus(rtk: RtkConfig, source: RtkStatus["source"], available: boolean): RtkStatus {
  return {
    enabled: rtk.enabled,
    available,
    source,
    version: rtk.version,
    delivery: rtk.delivery,
    auto_download: rtk.auto_download,
  };
}

async function binaryStatus(rtk: RtkConfig, binaryPath: string, source: RtkStatus["source"]): Promise<RtkStatus> {
  if (!(await pathExists(binaryPath))) {
    return {
      ...baseStatus(rtk, source, false),
      binary_path: binaryPath,
      error: `RTK binary does not exist: ${binaryPath}`,
    };
  }
  return {
    ...baseStatus(rtk, source, true),
    binary_path: binaryPath,
  };
}

async function pathRtkBinary(): Promise<string | undefined> {
  const names = process.platform === "win32" ? ["rtk.exe", "rtk.cmd", "rtk.bat"] : ["rtk"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        await fs.access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep scanning PATH.
      }
    }
  }
  return undefined;
}

function managedBinaryPath(version: string): string {
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(homeStateDir(), "rtk", version, platformAssetKey(), `rtk${ext}`);
}

async function downloadManagedRtk(version: string, target: string): Promise<void> {
  const release = await fetchJson<GitHubRelease>(`${GITHUB_API}/v${version}`);
  const asset = selectReleaseAsset(release.assets);
  const checksumAsset = release.assets.find((item) => /sha256|checksum/i.test(item.name));
  if (!asset) {
    throw new Error(`No RTK release asset matched ${process.platform}/${process.arch} for v${version}.`);
  }
  if (!checksumAsset) {
    throw new Error(`No checksum asset found for RTK v${version}.`);
  }

  const tempDir = path.join(homeStateDir(), "rtk", "downloads", `${version}-${Date.now()}`);
  await ensureDir(tempDir);
  const archive = path.join(tempDir, asset.name);
  try {
    const [checksumText] = await Promise.all([
      fetchText(checksumAsset.browser_download_url),
      downloadFile(asset.browser_download_url, archive),
    ]);
    await verifyChecksum(archive, asset.name, checksumText);
    const extracted = await extractRtkBinary(archive, tempDir);
    await ensureDir(path.dirname(target));
    await fs.copyFile(extracted, target);
    await fs.chmod(target, 0o755);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function selectReleaseAsset(assets: GitHubAsset[]): GitHubAsset | undefined {
  const platform = process.platform;
  const arch = process.arch;
  const platformPattern =
    platform === "darwin"
      ? /darwin|apple|macos/i
      : platform === "linux"
        ? /linux/i
        : platform === "win32"
          ? /windows|win32|pc-windows/i
          : undefined;
  const archPattern = arch === "arm64" ? /aarch64|arm64/i : arch === "x64" ? /x86_64|amd64|x64/i : undefined;
  if (!platformPattern || !archPattern) {
    return undefined;
  }
  return assets.find((asset) => platformPattern.test(asset.name) && archPattern.test(asset.name) && !/sha256|checksum/i.test(asset.name));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

async function downloadFile(url: string, target: string): Promise<void> {
  const response = await fetchWithTimeout(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(target, bytes);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);
  timeout.unref();
  try {
    return await fetch(url, {
      headers: { "user-agent": "inferoa-rtk-managed-runtime" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyChecksum(file: string, assetName: string, checksumText: string): Promise<void> {
  const expected = checksumText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.includes(assetName))
    ?.match(/[a-f0-9]{64}/i)?.[0]
    ?.toLowerCase();
  if (!expected) {
    throw new Error(`Checksum for ${assetName} was not found.`);
  }
  const actual = createHash("sha256").update(await fs.readFile(file)).digest("hex");
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${assetName}.`);
  }
}

async function extractRtkBinary(archive: string, tempDir: string): Promise<string> {
  if (/\.(tar\.gz|tgz)$/i.test(archive)) {
    const result = await runSmallCommand("tar", ["-xzf", archive, "-C", tempDir], tempDir, 30_000);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to extract RTK tarball.");
    }
  } else if (/\.zip$/i.test(archive)) {
    const result = await runSmallCommand("unzip", ["-q", archive, "-d", tempDir], tempDir, 30_000);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to extract RTK zip.");
    }
  } else {
    return archive;
  }
  const binary = await findRtkBinary(tempDir);
  if (!binary) {
    throw new Error("RTK archive did not contain an rtk binary.");
  }
  return binary;
}

async function findRtkBinary(dir: string): Promise<string | undefined> {
  const wanted = process.platform === "win32" ? "rtk.exe" : "rtk";
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findRtkBinary(full);
      if (nested) {
        return nested;
      }
    } else if (entry.isFile() && entry.name === wanted) {
      return full;
    }
  }
  return undefined;
}

function platformAssetKey(): string {
  return `${process.platform}-${process.arch}`;
}

interface GitHubRelease {
  assets: GitHubAsset[];
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}
