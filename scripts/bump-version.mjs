#!/usr/bin/env node
/**
 * 版本号统一修改 / 查看：package.json、src-tauri/tauri.conf.json、
 * src-tauri/Cargo.toml、src-tauri/Cargo.lock
 *
 *   node scripts/bump-version.mjs --show          # 只看当前版本（校验各处是否一致）
 *   node scripts/bump-version.mjs --current       # 只把当前版本号打到 stdout
 *   node scripts/bump-version.mjs --dry-run 0.2.0 # 预览
 *   node scripts/bump-version.mjs 0.2.0           # 精确版本
 *   node scripts/bump-version.mjs patch           # patch / minor / major
 *
 * 约定：**stdout 只输出最终版本号**（方便 shell 捕获），人类可读的说明走 stderr。
 * 退出码非 0 表示失败（版本不一致、匹配不到、写了多个地方等）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 三个必须保持一致的版本来源 */
const TARGETS = [
  {
    file: "package.json",
    pattern: /^(\s*"version"\s*:\s*")([^"]+)(")/m,
    hint: 'package.json 里的 "version"',
  },
  {
    file: "src-tauri/tauri.conf.json",
    pattern: /^(\s*"version"\s*:\s*")([^"]+)(")/m,
    hint: 'tauri.conf.json 里的 "version"',
  },
  {
    file: "src-tauri/Cargo.toml",
    // 只取 [package] 段里的第一处 version
    pattern: /(\[package\][^[]*?^version\s*=\s*")([^"]+)(")/ms,
    hint: "Cargo.toml [package] 里的 version",
  },
  {
    file: "src-tauri/Cargo.lock",
    // 锁文件里 workspace 成员的版本，不同步会让 git 工作区变脏
    pattern: /(\[\[package\]\]\nname = "media-manager"\nversion = ")([^"]+)(")/,
    hint: "Cargo.lock 里 media-manager 的 version",
    optional: true,
  },
];

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};
const log = (message) => console.error(message);

const read = (target) => {
  const path = resolve(root, target.file);
  const source = readFileSync(path, "utf8");
  const match = source.match(target.pattern);
  if (!match) {
    if (target.optional) return { path, source: "", current: null, skip: true };
    fail(`在 ${target.file} 里找不到版本号（${target.hint}）`);
  }
  return { path, source, current: match[2] };
};

const current = TARGETS.map((target) => ({ target, ...read(target) }));
/** 必填的目标（跳过可选的 Cargo.lock） */
const required = current.filter((entry) => !entry.skip);
const skipped = current.filter((entry) => entry.skip);

// ---------------------------------------------------------------- 模式解析

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const show = argv.includes("--show") || argv.length === 0;
const onlyCurrent = argv.includes("--current");
const spec = argv.find((arg) => !arg.startsWith("-"));

const versionOf = (entry) => entry.current;
const versions = new Set(required.map(versionOf));
if (versions.size !== 1) {
  log("✗ 版本号不一致：");
  for (const entry of required) log(`    ${entry.target.file.padEnd(26)} ${entry.current}`);
  log("  修好后重试，或直接跑 `just bump <版本>` 统一它们。");
  process.exit(1);
}
const version = [...versions][0];

if (!/^\d+\.\d+\.\d+/.test(version)) fail(`当前版本号格式异常：${version}`);

// --current：stdout 只吐版本号，给脚本用
if (onlyCurrent) {
  console.log(version);
  process.exit(0);
}

if (show && !spec) {
  log(`当前版本  ${version}`);
  for (const entry of required) log(`  ✓ ${entry.target.file.padEnd(26)} ${entry.current}`);
  for (const entry of skipped) log(`  - ${entry.target.file.padEnd(26)} 跳过（未找到记录）`);
  log("");
  log("改版本：just bump <版本|major|minor|patch>");
  log("发版：  just release [<版本>]（不给版本就交互式问；= 改版本 + commit + tag + push）");
  process.exit(0);
}

// ---------------------------------------------------------------- 计算新版本

const next = (() => {
  if (!spec) fail("用法：bump-version.mjs <版本|major|minor|patch> [--dry-run]");
  if (/^\d+\.\d+\.\d+/.test(spec)) return spec;
  const [major, minor, patch] = version.split(".").map(Number);
  if (spec === "major") return `${major + 1}.0.0`;
  if (spec === "minor") return `${major}.${minor + 1}.0`;
  if (spec === "patch") return `${major}.${minor}.${patch + 1}`;
  return fail(`无法识别的版本参数：${spec}（用 x.y.z / major / minor / patch）`);
})();

if (next === version) fail(`新版本和当前版本相同：${next}`);

log(`${dryRun ? "[dry-run] " : ""}版本 ${version} → ${next}`);
for (const entry of [...required, ...skipped]) {
  const { source } = entry;
  const replaced = source.replace(entry.target.pattern, (_all, head, _old, tail) => `${head}${next}${tail}`);
  const hits = source.match(new RegExp(entry.target.pattern.source, "gm"))?.length ?? 0;
  if (hits !== 1) fail(`${entry.target.file} 匹配到 ${hits} 处，预期 1 处，已中止`);
  if (!dryRun) writeFileSync(entry.path, replaced);
  log(`  ${dryRun ? "·" : "✓"} ${entry.target.file.padEnd(26)} ${entry.current} → ${next}`);
}

if (!dryRun) log("\n下一步：just release（已包含 commit + tag + push）或手动 git commit");

// stdout 只给版本号
console.log(next);
