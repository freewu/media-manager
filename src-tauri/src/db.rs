use crate::error::{AppError, Result};
use crate::models::{KindStat, Library, MediaItem, Settings, Stats};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const SETTINGS_KEY: &str = "settings";

/// 当前时间戳（毫秒）
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 解析 "应用目录/.data"。
///
/// 优先级：
/// 1. 环境变量 MEDIA_MANAGER_HOME（便于测试 / 便携部署）
/// 2. 应用目录：开发时为项目根目录，发布后为可执行文件所在目录
/// 3. 兜底：系统分配的应用本地数据目录
pub fn resolve_data_dir(app: &AppHandle) -> Result<PathBuf> {
    let candidates = data_dir_candidates(app);

    for dir in candidates {
        match std::fs::create_dir_all(&dir) {
            Ok(()) => return Ok(dir),
            Err(err) => {
                eprintln!("[media-manager] 无法创建数据目录 {}: {err}", dir.display());
            }
        }
    }

    Err(AppError::msg("无法创建数据目录，请检查磁盘权限"))
}

fn data_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(home) = std::env::var("MEDIA_MANAGER_HOME") {
        if !home.trim().is_empty() {
            candidates.push(PathBuf::from(home).join(".data"));
        }
    }

    let app_dir = if cfg!(debug_assertions) {
        // 开发模式：src-tauri/.. => 项目根目录
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(Path::to_path_buf)
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf))
    };

    if let Some(dir) = app_dir {
        candidates.push(dir.join(".data"));
    }

    if let Ok(local) = app.path().app_local_data_dir() {
        candidates.push(local.join(".data"));
    }

    candidates
}

/// SQLite 连接封装：整个应用共享一个连接（用 Mutex 串行化写操作）。
pub struct Db {
    path: PathBuf,
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Self::connect(path)?;
        let db = Self {
            path: path.to_path_buf(),
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// 建立一个新的连接（扫描线程 / 只读任务各用各的，避免长时间持锁）
    pub fn connect(path: &Path) -> Result<Connection> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA temp_store = MEMORY;",
        )?;
        Ok(conn)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn lock(&self) -> MutexGuard<'_, Connection> {
        // 只有在持锁线程 panic 时才会毒化，此时直接恢复数据即可
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.lock();
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS libraries (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                path         TEXT    NOT NULL UNIQUE,
                name         TEXT    NOT NULL,
                enabled      INTEGER NOT NULL DEFAULT 1,
                created_at   INTEGER NOT NULL,
                last_scan_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS media (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
                path       TEXT    NOT NULL UNIQUE,
                dir        TEXT    NOT NULL,
                file_name  TEXT    NOT NULL,
                title      TEXT    NOT NULL,
                ext        TEXT    NOT NULL,
                kind       TEXT    NOT NULL,
                size       INTEGER NOT NULL,
                mtime      INTEGER NOT NULL,
                duration   REAL,
                width      INTEGER,
                height     INTEGER,
                tags       TEXT    NOT NULL DEFAULT '',
                favorite   INTEGER NOT NULL DEFAULT 0,
                missing    INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_media_library  ON media(library_id);
            CREATE INDEX IF NOT EXISTS idx_media_kind     ON media(kind);
            CREATE INDEX IF NOT EXISTS idx_media_mtime    ON media(mtime DESC);
            CREATE INDEX IF NOT EXISTS idx_media_favorite ON media(favorite);
            CREATE INDEX IF NOT EXISTS idx_media_missing  ON media(missing);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;

        let has_settings: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![SETTINGS_KEY],
                |row| row.get(0),
            )
            .optional()?;

        if has_settings.is_none() {
            let json = serde_json::to_string(&Settings::default())?;
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                params![SETTINGS_KEY, json],
            )?;
        }

        Ok(())
    }

    // ------------------------------------------------------------------
    // 设置
    // ------------------------------------------------------------------

    pub fn settings(&self) -> Result<Settings> {
        let conn = self.lock();
        let raw: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![SETTINGS_KEY],
                |row| row.get(0),
            )
            .optional()?;

        Ok(match raw {
            Some(json) => serde_json::from_str(&json).unwrap_or_default(),
            None => Settings::default(),
        })
    }

    pub fn save_settings(&self, settings: &Settings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        let conn = self.lock();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SETTINGS_KEY, json],
        )?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // 媒体库
    // ------------------------------------------------------------------

    pub fn libraries(&self) -> Result<Vec<Library>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT l.id, l.path, l.name, l.enabled, l.created_at, l.last_scan_at,
                    COALESCE(s.cnt, 0), COALESCE(s.size, 0)
             FROM libraries l
             LEFT JOIN (
                 SELECT library_id, COUNT(*) AS cnt, SUM(size) AS size
                 FROM media WHERE missing = 0 GROUP BY library_id
             ) s ON s.library_id = l.id
             ORDER BY l.name COLLATE NOCASE",
        )?;

        let rows = stmt.query_map([], row_to_library)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn library(&self, id: i64) -> Result<Library> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT l.id, l.path, l.name, l.enabled, l.created_at, l.last_scan_at,
                    COALESCE(s.cnt, 0), COALESCE(s.size, 0)
             FROM libraries l
             LEFT JOIN (
                 SELECT library_id, COUNT(*) AS cnt, SUM(size) AS size
                 FROM media WHERE missing = 0 GROUP BY library_id
             ) s ON s.library_id = l.id
             WHERE l.id = ?1",
        )?;

        stmt.query_row(params![id], row_to_library)
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("媒体库 #{id}")))
    }

    pub fn add_library(&self, path: &Path) -> Result<Library> {
        let normalized = normalize_path(path)?;
        let name = normalized
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| normalized.to_string_lossy().to_string());

        let conn = self.lock();
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM libraries WHERE path = ?1",
                params![normalized.to_string_lossy()],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(id) = existing {
            drop(conn);
            return self.library(id);
        }

        conn.execute(
            "INSERT INTO libraries (path, name, enabled, created_at) VALUES (?1, ?2, 1, ?3)",
            params![normalized.to_string_lossy(), name, now_ms()],
        )?;
        let id = conn.last_insert_rowid();
        drop(conn);
        self.library(id)
    }

    pub fn set_library_enabled(&self, id: i64, enabled: bool) -> Result<()> {
        let conn = self.lock();
        conn.execute(
            "UPDATE libraries SET enabled = ?2 WHERE id = ?1",
            params![id, enabled as i64],
        )?;
        Ok(())
    }

    pub fn remove_library(&self, id: i64) -> Result<()> {
        let conn = self.lock();
        conn.execute("DELETE FROM libraries WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // 媒体资源
    // ------------------------------------------------------------------

    pub fn media_page(&self, query: &crate::models::MediaQuery) -> Result<(Vec<MediaItem>, i64)> {
        let mut where_sql = String::from(" WHERE 1 = 1");
        let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(library_id) = query.library_id {
            where_sql.push_str(" AND m.library_id = ?");
            args.push(Box::new(library_id));
        }
        if let Some(kind) = query.kind.as_ref().filter(|k| !k.is_empty() && *k != "all") {
            where_sql.push_str(" AND m.kind = ?");
            args.push(Box::new(kind.clone()));
        }
        if let Some(search) = query
            .search
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            where_sql.push_str(" AND (m.title LIKE ? OR m.file_name LIKE ? OR m.path LIKE ?)");
            let like = format!("%{}%", escape_like(search));
            args.push(Box::new(like.clone()));
            args.push(Box::new(like.clone()));
            args.push(Box::new(like));
        }
        if let Some(favorite) = query.favorite {
            if favorite {
                where_sql.push_str(" AND m.favorite = 1");
            }
        }
        match query.missing {
            Some(true) => where_sql.push_str(" AND m.missing = 1"),
            Some(false) => where_sql.push_str(" AND m.missing = 0"),
            None => {}
        }

        let sort = match query.sort.as_deref() {
            Some("size") => "m.size",
            Some("mtime") => "m.mtime",
            Some("created") => "m.created_at",
            Some("kind") => "m.kind",
            _ => "m.title",
        };
        let order = match query.order.as_deref() {
            Some("asc") => "ASC",
            Some("desc") => "DESC",
            // 标题默认升序，其它字段默认降序（最新/最大在前）
            _ => {
                if sort == "m.title" {
                    "ASC"
                } else {
                    "DESC"
                }
            }
        };

        // 文本字段需要不区分大小写排序，COLLATE 必须写在 ASC/DESC 之前
        // （`x ASC COLLATE NOCASE` 是语法错误）
        let collate = if matches!(sort, "m.title" | "m.kind") {
            " COLLATE NOCASE"
        } else {
            ""
        };

        let limit = query.limit.unwrap_or(200).clamp(1, 2000);
        let offset = query.offset.unwrap_or(0).max(0);

        let conn = self.lock();

        let count_sql = format!("SELECT COUNT(*) FROM media m{where_sql}");
        let total: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(args.iter().map(|a| a.as_ref())),
            |row| row.get(0),
        )?;

        let list_sql = format!(
            "SELECT {MEDIA_COLUMNS}
             FROM media m
             LEFT JOIN libraries l ON l.id = m.library_id
             {where_sql}
             ORDER BY {sort}{collate} {order}, m.id
             LIMIT ? OFFSET ?"
        );

        let mut list_args: Vec<Box<dyn rusqlite::ToSql>> = args;
        list_args.push(Box::new(limit));
        list_args.push(Box::new(offset));

        let mut stmt = conn.prepare(&list_sql)?;
        let rows = stmt.query_map(
            rusqlite::params_from_iter(list_args.iter().map(|a| a.as_ref())),
            row_to_media,
        )?;
        let items = rows.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok((items, total))
    }

    pub fn media(&self, id: i64) -> Result<MediaItem> {
        let conn = self.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {MEDIA_COLUMNS}
             FROM media m
             LEFT JOIN libraries l ON l.id = m.library_id
             WHERE m.id = ?1"
        ))?;
        stmt.query_row(params![id], row_to_media)
            .optional()?
            .ok_or_else(|| AppError::not_found(format!("媒体 #{id}")))
    }

    pub fn update_media(
        &self,
        id: i64,
        title: Option<String>,
        tags: Option<Vec<String>>,
        favorite: Option<bool>,
    ) -> Result<MediaItem> {
        let conn = self.lock();
        if let Some(title) = title {
            let title = title.trim();
            if !title.is_empty() {
                conn.execute(
                    "UPDATE media SET title = ?2, updated_at = ?3 WHERE id = ?1",
                    params![id, title, now_ms()],
                )?;
            }
        }
        if let Some(tags) = tags {
            conn.execute(
                "UPDATE media SET tags = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, join_tags(&tags), now_ms()],
            )?;
        }
        if let Some(favorite) = favorite {
            conn.execute(
                "UPDATE media SET favorite = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, favorite as i64, now_ms()],
            )?;
        }
        drop(conn);
        self.media(id)
    }

    /// 仅删除数据库记录（不删除磁盘文件）
    pub fn delete_media(&self, ids: &[i64]) -> Result<usize> {
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.lock();
        let mut removed = 0;
        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = tx.prepare("DELETE FROM media WHERE id = ?1")?;
            for id in ids {
                removed += stmt.execute(params![id])?;
            }
        }
        tx.commit()?;
        Ok(removed)
    }

    /// 清理所有已失效（文件已不存在）的记录
    pub fn clean_missing(&self) -> Result<usize> {
        let conn = self.lock();
        let removed = conn.execute("DELETE FROM media WHERE missing = 1", [])?;
        Ok(removed)
    }

    pub fn stats(&self) -> Result<Stats> {
        let conn = self.lock();

        let (total, total_size, favorite, missing): (i64, i64, i64, i64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(size), 0),
                    COALESCE(SUM(favorite), 0),
                    COALESCE(SUM(missing), 0)
             FROM media",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;

        let mut by_kind = Vec::new();
        {
            let mut stmt = conn.prepare(
                "SELECT kind, COUNT(*), COALESCE(SUM(size), 0)
                 FROM media WHERE missing = 0
                 GROUP BY kind ORDER BY COUNT(*) DESC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(KindStat {
                    kind: row.get(0)?,
                    count: row.get(1)?,
                    size: row.get(2)?,
                })
            })?;
            for row in rows {
                by_kind.push(row?);
            }
        }

        let libraries: i64 =
            conn.query_row("SELECT COUNT(*) FROM libraries", [], |row| row.get(0))?;
        let last_scan_at: Option<i64> =
            conn.query_row("SELECT MAX(last_scan_at) FROM libraries", [], |row| {
                row.get(0)
            })?;

        Ok(Stats {
            total,
            total_size,
            favorite,
            missing,
            libraries,
            last_scan_at,
            by_kind,
        })
    }

    pub fn sqlite_version(&self) -> String {
        rusqlite::version().to_string()
    }
}

const MEDIA_COLUMNS: &str =
    "m.id, m.library_id, l.name, m.path, m.dir, m.file_name, m.title, m.ext, \
     m.kind, m.size, m.mtime, m.duration, m.width, m.height, m.tags, m.favorite, m.missing, \
     m.created_at, m.updated_at";

fn row_to_library(row: &Row) -> rusqlite::Result<Library> {
    Ok(Library {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        enabled: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        last_scan_at: row.get(5)?,
        media_count: row.get(6)?,
        total_size: row.get(7)?,
    })
}

fn row_to_media(row: &Row) -> rusqlite::Result<MediaItem> {
    let tags: String = row.get(14)?;
    Ok(MediaItem {
        id: row.get(0)?,
        library_id: row.get(1)?,
        library_name: row.get(2)?,
        path: row.get(3)?,
        dir: row.get(4)?,
        file_name: row.get(5)?,
        title: row.get(6)?,
        ext: row.get(7)?,
        kind: row.get(8)?,
        size: row.get(9)?,
        mtime: row.get(10)?,
        duration: row.get(11)?,
        width: row.get(12)?,
        height: row.get(13)?,
        tags: parse_tags(&tags),
        favorite: row.get::<_, i64>(15)? != 0,
        missing: row.get::<_, i64>(16)? != 0,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

pub fn parse_tags(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub fn join_tags(tags: &[String]) -> String {
    let mut cleaned: Vec<String> = tags
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    cleaned.sort();
    cleaned.dedup();
    cleaned.join(",")
}

fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// 统一成绝对路径（去掉 Windows 的 \\?\ 前缀，替换 / 为 \）
pub fn normalize_path(path: &Path) -> Result<PathBuf> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };

    let mut text = absolute.to_string_lossy().to_string();
    if let Some(stripped) = text.strip_prefix(r"\\?\") {
        text = stripped.to_string();
    }
    #[cfg(windows)]
    {
        text = text.replace('/', "\\");
    }

    let normalized = PathBuf::from(&text);
    if !normalized.exists() {
        return Err(AppError::msg(format!("路径不存在: {text}")));
    }
    if !normalized.is_dir() {
        return Err(AppError::msg(format!("不是目录: {text}")));
    }
    Ok(normalized)
}
