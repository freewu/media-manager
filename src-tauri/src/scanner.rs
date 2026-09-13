use crate::db::{now_ms, Db};
use crate::error::Result;
use crate::media;
use crate::models::{Library, ScanProgress, ScanSummary, Settings};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use walkdir::{DirEntry, WalkDir};

pub const EVENT_PROGRESS: &str = "scan://progress";
pub const EVENT_DONE: &str = "scan://done";

/// 每处理多少个文件提交一次事务 / 推送一次进度
const BATCH_SIZE: usize = 500;
const EMIT_INTERVAL: Duration = Duration::from_millis(120);

/// 扫描任务状态（全局单例，保证同一时间只有一个扫描在跑）
#[derive(Default)]
pub struct ScanState {
    running: AtomicBool,
    cancel: AtomicBool,
}

impl ScanState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn cancel_requested(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    fn try_begin(&self) -> bool {
        if self.running.swap(true, Ordering::SeqCst) {
            return false;
        }
        self.cancel.store(false, Ordering::SeqCst);
        true
    }

    fn finish(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.cancel.store(false, Ordering::SeqCst);
    }
}

/// 扫描入口（应在阻塞线程中调用）
pub fn scan<R: Runtime>(
    app: AppHandle<R>,
    db: Arc<Db>,
    state: Arc<ScanState>,
    library_ids: Option<Vec<i64>>,
) -> ScanSummary {
    if !state.try_begin() {
        return ScanSummary {
            scanned: 0,
            added: 0,
            updated: 0,
            skipped: 0,
            missing: 0,
            failed: 0,
            elapsed_ms: 0,
            cancelled: true,
            libraries: 0,
        };
    }

    let started = Instant::now();
    let mut summary = ScanSummary {
        scanned: 0,
        added: 0,
        updated: 0,
        skipped: 0,
        missing: 0,
        failed: 0,
        elapsed_ms: 0,
        cancelled: false,
        libraries: 0,
    };

    if let Err(err) = run(&app, &db, &state, library_ids, &mut summary, started) {
        eprintln!("[media-manager] 扫描失败: {err}");
        summary.failed += 1;
    }

    summary.elapsed_ms = started.elapsed().as_millis() as u64;
    state.finish();

    let _ = app.emit(EVENT_DONE, &summary);
    summary
}

fn run<R: Runtime>(
    app: &AppHandle<R>,
    db: &Arc<Db>,
    state: &Arc<ScanState>,
    library_ids: Option<Vec<i64>>,
    summary: &mut ScanSummary,
    started: Instant,
) -> Result<()> {
    let settings = db.settings()?;
    let index = media::build_index(&settings);

    let wanted: Option<HashSet<i64>> = library_ids
        .filter(|ids| !ids.is_empty())
        .map(|ids| ids.into_iter().collect());

    let libraries: Vec<Library> = db
        .libraries()?
        .into_iter()
        .filter(|l| l.enabled)
        .filter(|l| match &wanted {
            Some(set) => set.contains(&l.id),
            None => true,
        })
        .collect();

    summary.libraries = libraries.len();
    if libraries.is_empty() {
        return Ok(());
    }

    // 独立连接：扫描期间不阻塞前端查询
    let mut conn = Db::connect(db.path())?;
    conn.execute_batch("CREATE TEMP TABLE IF NOT EXISTS scan_seen (id INTEGER PRIMARY KEY);")?;

    let library_count = libraries.len();

    for (position, library) in libraries.iter().enumerate() {
        if state.cancel_requested() {
            summary.cancelled = true;
            break;
        }
        if !Path::new(&library.path).is_dir() {
            summary.failed += 1;
            continue;
        }

        scan_library(
            app,
            &mut conn,
            state,
            summary,
            &settings,
            &index,
            library,
            position,
            library_count,
            started,
        )?;
    }

    if summary.cancelled {
        emit_progress(
            app,
            state,
            ScanProgress {
                running: false,
                finished: false,
                cancelled: true,
                library_id: None,
                library_name: "已取消".into(),
                library_index: 0,
                library_count,
                scanned: summary.scanned,
                added: summary.added,
                updated: summary.updated,
                skipped: summary.skipped,
                missing: summary.missing,
                failed: summary.failed,
                current: String::new(),
                elapsed_ms: started.elapsed().as_millis() as u64,
            },
        );
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn scan_library<R: Runtime>(
    app: &AppHandle<R>,
    conn: &mut Connection,
    state: &Arc<ScanState>,
    summary: &mut ScanSummary,
    settings: &Settings,
    index: &std::collections::HashMap<String, String>,
    library: &Library,
    position: usize,
    library_count: usize,
    started: Instant,
) -> Result<()> {
    let mut seen: HashSet<i64> = HashSet::new();
    let mut last_emit = Instant::now();
    let mut batch = 0usize;
    let mut current = library.path.clone();

    let walker = WalkDir::new(&library.path)
        .follow_links(settings.follow_symlinks)
        .into_iter()
        .filter_entry(|entry| !is_ignored(entry, settings));

    let mut tx = conn.transaction()?;

    // 先推一次进度，让界面立刻切换到 "正在扫描"
    emit_progress(
        app,
        state,
        ScanProgress {
            running: true,
            finished: false,
            cancelled: false,
            library_id: Some(library.id),
            library_name: library.name.clone(),
            library_index: position + 1,
            library_count,
            scanned: summary.scanned,
            added: summary.added,
            updated: summary.updated,
            skipped: summary.skipped,
            missing: summary.missing,
            failed: summary.failed,
            current: current.clone(),
            elapsed_ms: started.elapsed().as_millis() as u64,
        },
    );

    for entry in walker {
        if state.cancel_requested() {
            summary.cancelled = true;
            break;
        }

        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                // 权限不足等：跳过并继续
                summary.failed += 1;
                eprintln!("[media-manager] 跳过无法访问的路径: {err}");
                continue;
            }
        };

        let path = entry.path();
        let ext = media::extension_of(path);
        let kind = match index.get(&ext) {
            Some(kind) => kind.clone(),
            None => continue,
        };

        let metadata = match std::fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => {
                summary.failed += 1;
                continue;
            }
        };
        if !metadata.is_file() {
            continue;
        }

        let size = metadata.len() as i64;
        if settings.min_size_kb > 0 && size < settings.min_size_kb.saturating_mul(1024) {
            summary.skipped += 1;
            continue;
        }

        let mtime = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        let path_text = path.to_string_lossy().to_string();
        current = path_text.clone();
        summary.scanned += 1;

        let previous: Option<(i64, i64, i64)> = {
            let mut stmt =
                tx.prepare_cached("SELECT id, size, mtime FROM media WHERE path = ?1")?;
            stmt.query_row(params![path_text], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .ok()
        };

        match previous {
            Some((id, old_size, old_mtime)) if old_size == size && old_mtime == mtime => {
                seen.insert(id);
                summary.skipped += 1;
            }
            Some((id, _, _)) => {
                tx.prepare_cached(
                    "UPDATE media
                     SET library_id = ?2, dir = ?3, file_name = ?4, title = ?5, ext = ?6,
                         kind = ?7, size = ?8, mtime = ?9, missing = 0, updated_at = ?10
                     WHERE id = ?1",
                )?
                .execute(params![
                    id,
                    library.id,
                    parent_dir(path),
                    file_name(path),
                    title_of(path),
                    ext,
                    kind,
                    size,
                    mtime,
                    now_ms(),
                ])?;
                seen.insert(id);
                summary.updated += 1;
            }
            None => {
                tx.prepare_cached(
                    "INSERT INTO media
                        (library_id, path, dir, file_name, title, ext, kind, size, mtime,
                         tags, favorite, missing, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', 0, 0, ?10, ?10)
                     ON CONFLICT(path) DO UPDATE SET
                        library_id = excluded.library_id,
                        size = excluded.size,
                        mtime = excluded.mtime,
                        missing = 0,
                        updated_at = excluded.updated_at",
                )?
                .execute(params![
                    library.id,
                    path_text,
                    parent_dir(path),
                    file_name(path),
                    title_of(path),
                    ext,
                    kind,
                    size,
                    mtime,
                    now_ms(),
                ])?;
                seen.insert(tx.last_insert_rowid());
                summary.added += 1;
            }
        }

        batch += 1;
        if batch >= BATCH_SIZE {
            tx.commit()?;
            tx = conn.transaction()?;
            batch = 0;
        }

        if last_emit.elapsed() >= EMIT_INTERVAL {
            emit_progress(
                app,
                state,
                ScanProgress {
                    running: true,
                    finished: false,
                    cancelled: false,
                    library_id: Some(library.id),
                    library_name: library.name.clone(),
                    library_index: position + 1,
                    library_count,
                    scanned: summary.scanned,
                    added: summary.added,
                    updated: summary.updated,
                    skipped: summary.skipped,
                    missing: summary.missing,
                    failed: summary.failed,
                    current: current.clone(),
                    elapsed_ms: started.elapsed().as_millis() as u64,
                },
            );
            last_emit = Instant::now();
        }
    }

    // 收尾：写入本次扫描到的 id，未被扫描到的记录标记为失效
    if !summary.cancelled {
        tx.execute("DELETE FROM scan_seen", [])?;
        {
            let mut insert = tx.prepare("INSERT OR IGNORE INTO scan_seen (id) VALUES (?1)")?;
            for id in &seen {
                insert.execute(params![id])?;
            }
        }
        summary.missing += tx.execute(
            "UPDATE media SET missing = 1
             WHERE library_id = ?1 AND missing = 0
               AND id NOT IN (SELECT id FROM scan_seen)",
            params![library.id],
        )? as u64;
        tx.execute(
            "UPDATE libraries SET last_scan_at = ?2 WHERE id = ?1",
            params![library.id, now_ms()],
        )?;
    }

    tx.commit()?;
    Ok(())
}

fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    state: &Arc<ScanState>,
    mut progress: ScanProgress,
) {
    progress.running = state.is_running() && !progress.cancelled;
    let _ = app.emit(EVENT_PROGRESS, progress);
}

fn is_ignored(entry: &DirEntry, settings: &Settings) -> bool {
    let name = entry.file_name().to_string_lossy();
    if settings.skip_hidden && name.starts_with('.') {
        return true;
    }
    if entry.file_type().is_dir() {
        return settings
            .ignore_dirs
            .iter()
            .any(|dir| dir.eq_ignore_ascii_case(name.as_ref()));
    }
    false
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn parent_dir(path: &Path) -> String {
    path.parent()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn title_of(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name(path))
}
