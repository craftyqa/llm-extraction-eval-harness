import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

let cachedAppVersion: string | undefined;

/** `package.json` version + git short SHA, with `-dirty` if tracked files have changes; `+unknown` outside git. */
export function appVersion(): string {
  if (cachedAppVersion !== undefined) return cachedAppVersion;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    version: string;
  };
  let build = "unknown";
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    const sha = git("rev-parse", "--short=7", "HEAD");
    const dirty = git("status", "--porcelain", "--untracked-files=no") !== "";
    build = dirty ? `${sha}-dirty` : sha;
  } catch {
    // Not a git checkout, or git isn't installed
  }
  cachedAppVersion = `${pkg.version}+${build}`;
  return cachedAppVersion;
}

/**
 * `$HARDWARE_PROFILE` (e.g. a CI runner label), else platform, architecture and
 * CPU model. Results from different profiles are never compared (docs/specs.md).
 */
export function hardwareProfile(): string {
  const configured = process.env["HARDWARE_PROFILE"];
  if (configured !== undefined && configured !== "") return configured;
  return `${platform()}-${arch()} ${cpus()[0]?.model.trim() ?? "unknown CPU"}`;
}
