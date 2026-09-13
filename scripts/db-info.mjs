#!/usr/bin/env node
/**
 * 查看本地 SQLite 数据概况（`just db`）。
 *
 * 数据库固定叫 data.db，按应用的解析顺序找一遍，也可以用参数指定：
 *   just db
 *   just db /path/to/data.db
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const candidates = [
  process.env.MEDIA_MANAGER_HOME &&
    resolve(process.env.MEDIA_MANAGER_HOME, ".data", "data.db"),
  resolve(root, ".data", "data.db"), // 开发模式：项目根目录
  resolve(root, "src-tauri", "target", "release", ".data", "data.db"), // 打包后：exe 同级
  resolve(root, "src-tauri", "target", "debug", ".data", "data.db"),
].filter(Boolean);

const arg = process.argv[2];
const dbPath = arg ? resolve(arg) : candidates.find((path) => existsSync(path));

if (!dbPath || !existsSync(dbPath)) {
  console.error("找不到数据库，先启动一次应用（just dev），或指定路径：just db <path>");
  console.error("已检查：");
  for (const path of candidates) console.error(`  - ${path}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const query = (sql, ...params) => db.prepare(sql).all(...params);
const scalar = (sql, ...params) => {
  const row = db.prepare(sql).get(...params);
  return row ? Object.values(row)[0] : null;
};

const kb = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};
const time = (ms) => (ms ? new Date(Number(ms)).toLocaleString() : "-");

console.log(`数据库  ${dbPath}`);
console.log(`大小    ${kb(statSync(dbPath).size)}   日志模式 ${scalar("PRAGMA journal_mode")}`);
console.log("");
console.log("表");
for (const { name } of query(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
)) {
  console.log(`  ${name.padEnd(12)} ${String(scalar(`SELECT COUNT(*) FROM ${name}`)).padStart(6)} 行`);
}
console.log("");

const libraries = query(
  `SELECT l.id, l.name, l.path, l.enabled, l.last_scan_at, l.created_at,
          COALESCE(s.cnt, 0)  AS media_count,
          COALESCE(s.size, 0) AS total_size,
          COALESCE(s.missing, 0) AS missing_count
     FROM libraries l
     LEFT JOIN (
          SELECT library_id, COUNT(*) AS cnt, SUM(size) AS size,
                 SUM(missing) AS missing
            FROM media WHERE missing = 0 GROUP BY library_id
     ) s ON s.library_id = l.id
    ORDER BY l.id`,
);
console.log(`媒体库（${libraries.length}）`);
if (!libraries.length) console.log("  （空，先添加一个扫描目录）");
for (const lib of libraries) {
  console.log(
    `  #${lib.id} ${lib.enabled ? "启用" : "停用"}  ${lib.name}  ` +
      `${lib.media_count} 条 / ${kb(lib.total_size)}` +
      (lib.missing_count ? ` / 失效 ${lib.missing_count}` : ""),
  );
  console.log(`      ${lib.path}`);
  console.log(`      上次扫描 ${time(lib.last_scan_at)}`);
}
console.log("");

console.log("媒体类型");
for (const row of query(
  "SELECT kind, COUNT(*) AS count, SUM(size) AS size, SUM(favorite) AS favorite FROM media GROUP BY kind ORDER BY count DESC",
)) {
  console.log(
    `  ${String(row.kind).padEnd(10)} ${String(row.count).padStart(6)} 条   ` +
      `${kb(row.size).padStart(9)}   收藏 ${row.favorite ?? 0}`,
  );
}
const missing = scalar("SELECT COUNT(*) FROM media WHERE missing = 1");
if (missing) console.log(`  失效记录 ${missing} 条（界面里可一键清理）`);
console.log("");

const tags = query(
  `SELECT tags, COUNT(*) AS count FROM media WHERE tags <> '' GROUP BY tags ORDER BY count DESC LIMIT 10`,
);
if (tags.length) {
  console.log("标签 Top 10");
  for (const row of tags) console.log(`  ${String(row.count).padStart(5)}  ${row.tags}`);
  console.log("");
}

const settings = scalar("SELECT value FROM settings WHERE key = 'settings'");
if (settings) {
  console.log("设置");
  try {
    console.log(JSON.stringify(JSON.parse(settings), null, 2).replace(/^/gm, "  "));
  } catch {
    console.log(`  ${settings}`);
  }
}

db.close();
