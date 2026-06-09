import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PublishPackageInfo {
  name: string;
  version: string;
}

export interface PublishEnvironment {
  GITHUB_EVENT_NAME?: string;
  GITHUB_REF?: string;
  GITHUB_RUN_NUMBER?: string;
  GITHUB_SHA?: string;
}

export interface NpmPublishCoordinates {
  name: string;
  version: string;
  publish_version: string;
  dist_tag: "dev" | "latest";
}

export function resolveNpmPublishCoordinates(pkg: PublishPackageInfo, env: PublishEnvironment): NpmPublishCoordinates {
  const isMainPush = env.GITHUB_EVENT_NAME === "push" && env.GITHUB_REF === "refs/heads/main";
  const tagVersion = tagVersionFromRef(env.GITHUB_REF);
  if (tagVersion && tagVersion !== pkg.version) {
    throw new Error(`Tag v${tagVersion} does not match package version ${pkg.version}`);
  }
  const baseVersion = pkg.version.replace(/-.*/, "");
  const shortSha = (env.GITHUB_SHA ?? "").slice(0, 7);
  const publishVersion = isMainPush
    ? `${baseVersion}-dev.${env.GITHUB_RUN_NUMBER ?? "0"}.${shortSha || "unknown"}`
    : pkg.version;
  return {
    name: pkg.name,
    version: pkg.version,
    publish_version: publishVersion,
    dist_tag: isMainPush ? "dev" : "latest",
  };
}

function tagVersionFromRef(ref: string | undefined): string | undefined {
  const match = /^refs\/tags\/v(.+)$/.exec(ref ?? "");
  return match?.[1];
}

function readPackageInfo(cwd: string): PublishPackageInfo {
  const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as Partial<PublishPackageInfo>;
  if (!pkg.name || !pkg.version) {
    throw new Error("package.json must include name and version");
  }
  return { name: pkg.name, version: pkg.version };
}

function printGithubOutputs(coordinates: NpmPublishCoordinates): void {
  for (const [key, value] of Object.entries(coordinates)) {
    console.log(`${key}=${value}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  printGithubOutputs(resolveNpmPublishCoordinates(readPackageInfo(process.cwd()), process.env));
}
