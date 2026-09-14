#!/usr/bin/env node
/**
 * 本地打「独立可执行文件」：前端构建 + release 编译（--no-bundle，不打安装包、不联网下载 NSIS/WiX），
 * 再把产物复制到 out/ 并算出 sha256。
 *
 *   node scripts/build-standalone.mjs                  # 当前平台
 *   node scripts/build-standalone.mjs --target <triple># 指定目标（需先 rustup target add）
 *   node scripts/build-standalone.mjs --no-copy        # 只编译，不复制到 out/
 *
 * 特点：**只读版本号，绝不修改**（版本号是 `just publish` 的职责）；不 commit、不 push。
 * 产物命名与 GitHub Actions 发布的一致：media-manager-<版本>-<平台>-<架构>[.exe]
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const log = (message) => console.log(message);
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

// ---------------------------------------------------------------- 参数
let target = null;
let copy = true;
const passthrough = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--target") {
    target = argv[i + 1];
    if (!target) fail("--target 后面要跟目标三元组，例如 x86_64-pc-windows-msvc");
    i += 1;
  } else if (arg.startsWith("--target=")) {
    target = arg.slice("--target=".length);
  } else if (arg === "--no-copy") {
    copy = false;
  } else {
    passthrough.push(arg); // 其余参数原样交给 tauri build（例如 --features xxx）
  }
}

// ---------------------------------------------------------------- 版本（只读）
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// ---------------------------------------------------------------- 平台命名（与 CI 产物保持一致）
const OS_NAMES = { win32: "windows", darwin: "macos", linux: "linux" };
const ARCH_NAMES = { x64: "x86_64", arm64: "aarch64", ia32: "i686", arm: "armv7" };

const fromTriple = (triple) => {
  const [arch, , os] = triple.split("-"); // x86_64-pc-windows-msvc / aarch64-apple-darwin
  const osName = os?.startsWith("windows")
    ? "windows"
    : os?.startsWith("darwin")
      ? "macos"
      : os?.startsWith("linux")
        ? "linux"
        : null;
  if (!arch || !osName) fail(`看不懂的目标三元组：${triple}`);
  return { osName, archName: ARCH_NAMES[arch] ?? arch };
};

const { osName, archName } = target
  ? fromTriple(target)
  : { osName: OS_NAMES[process.platform] ?? process.platform, archName: ARCH_NAMES[process.arch] ?? process.arch };

const exeSuffix = osName === "windows" ? ".exe" : "";
const binaryName = `media-manager${exeSuffix}`;

// ---------------------------------------------------------------- 1. 编译
const buildArgs = ["run", "app:build", "--", "--no-bundle"];
if (target) buildArgs.push("--target", target);
buildArgs.push(...passthrough);

log(`▸ 编译 ${version} · ${osName}-${archName}${target ? ` (${target})` : ""}`);
log(`  ${["npm", ...buildArgs].join(" ")}`);

const npm = "npm";
// Windows 上 npm 实际是 npm.cmd，必须走 shell；但 shell:true 同时传参数数组会触发
// Node 的 DEP0190 警告，所以 Windows 拼成单条命令字符串。
const result =
  process.platform === "win32"
    ? spawnSync([npm, ...buildArgs].map((part) => (/[\s"]/.test(part) ? `"${part}"` : part)).join(" "), {
        cwd: root,
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(npm, buildArgs, { cwd: root, stdio: "inherit" });
if (result.error) fail(`启动 npm 失败：${result.error.message}`);
if (result.status !== 0) fail(`编译失败（npm 退出码 ${result.status}）`);

// ---------------------------------------------------------------- 2. 定位产物
const releaseDir = target
  ? join(root, "src-tauri", "target", target, "release")
  : join(root, "src-tauri", "target", "release");
const binary = join(releaseDir, binaryName);
if (!existsSync(binary)) fail(`没找到编译产物：${binary}`);

const size = statSync(binary).size;
const human = (bytes) => {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
};
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

if (!copy) {
  log("");
  log(`✓ 编译完成：${binary}（${human(size)}）`);
  log(`  sha256 ${sha256(binary)}`);
  log(`  数据目录：${join(releaseDir, ".data", "data.db")}（可在 exe 同级放 .data/）`);
  process.exit(0);
}

// ---------------------------------------------------------------- 3. 复制到 out/ + 汇总校验和
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });
const staged = join(outDir, `media-manager-${version}-${osName}-${archName}${exeSuffix}`);
copyFileSync(binary, staged);

const files = readdirSync(outDir)
  .filter((name) => name.startsWith("media-manager-"))
  .sort();
const sums = files.map((name) => `${sha256(join(outDir, name))}  ${name}`).join("\n");
writeFileSync(join(outDir, "SHA256SUMS.txt"), `${sums}\n`);

log("");
log(`✓ 独立可执行文件：out/${basename(staged)}（${human(size)}）`);
log(`  sha256  ${sha256(staged)}`);
log(`  编译产物 ${binary}`);
log(`  校验和  out/SHA256SUMS.txt（${files.length} 个文件）`);
log("");
log("  这是免安装单文件：拷到任意目录双击（或终端执行）即可运行，");
log(`  运行数据写在 exe 同级的 .data/data.db，可用 MEDIA_MANAGER_HOME 改到别处。`);
