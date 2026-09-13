use crate::db::Db;
use crate::error::{AppError, Result};
use crate::models::{AppInfo, Library, MediaItem, MediaPage, MediaQuery, Settings, Stats};
use crate::scanner::{self, ScanState};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// 全局应用状态
pub struct AppState {
    pub db: Arc<Db>,
    pub scan: Arc<ScanState>,
    pub data_dir: PathBuf,
}

/// 让 asset:// 协议可以读取该目录（用于前端预览本地图片 / 视频）
pub fn allow_asset_dir(app: &AppHandle, path: &Path) {
    if let Err(err) = app.asset_protocol_scope().allow_directory(path, true) {
        eprintln!("[media-manager] 无法授权资源目录 {}: {err}", path.display());
    }
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        identifier: app.config().identifier.clone(),
        platform: std::env::consts::OS.to_string(),
        db_path: state.db.path().to_string_lossy().to_string(),
        data_dir: state.data_dir.to_string_lossy().to_string(),
        sqlite_version: state.db.sqlite_version(),
    }
}

// ---------------------------------------------------------------------------
// 媒体库
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_libraries(state: State<'_, AppState>) -> Result<Vec<Library>> {
    state.db.libraries()
}

#[tauri::command]
pub fn add_library(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Library> {
    let library = state.db.add_library(Path::new(&path))?;
    allow_asset_dir(&app, Path::new(&library.path));
    Ok(library)
}

#[tauri::command]
pub fn set_library_enabled(state: State<'_, AppState>, id: i64, enabled: bool) -> Result<()> {
    state.db.set_library_enabled(id, enabled)
}

#[tauri::command]
pub fn remove_library(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.db.remove_library(id)
}

// ---------------------------------------------------------------------------
// 扫描
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn scan(
    app: AppHandle,
    state: State<'_, AppState>,
    library_ids: Option<Vec<i64>>,
) -> Result<bool> {
    if state.scan.is_running() {
        return Err(AppError::msg("已有扫描任务正在运行"));
    }
    if state.db.libraries()?.is_empty() {
        return Err(AppError::msg("还没有添加任何扫描目录"));
    }

    let db = state.db.clone();
    let scan_state = state.scan.clone();
    // 扫描是 IO 密集任务，放到阻塞线程池，避免卡住主线程
    tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(app, db, scan_state, library_ids);
    });

    Ok(true)
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) -> bool {
    state.scan.cancel();
    true
}

#[tauri::command]
pub fn scan_status(state: State<'_, AppState>) -> bool {
    state.scan.is_running()
}

// ---------------------------------------------------------------------------
// 媒体资源
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_media(state: State<'_, AppState>, query: MediaQuery) -> Result<MediaPage> {
    let (items, total) = state.db.media_page(&query)?;
    Ok(MediaPage { items, total })
}

#[tauri::command]
pub fn get_media(state: State<'_, AppState>, id: i64) -> Result<MediaItem> {
    state.db.media(id)
}

#[tauri::command]
pub fn update_media(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    tags: Option<Vec<String>>,
    favorite: Option<bool>,
) -> Result<MediaItem> {
    state.db.update_media(id, title, tags, favorite)
}

/// 删除记录；delete_files = true 时同时删除磁盘文件（不可恢复）
#[tauri::command]
pub fn delete_media(
    state: State<'_, AppState>,
    ids: Vec<i64>,
    delete_files: Option<bool>,
) -> Result<usize> {
    if delete_files.unwrap_or(false) {
        for id in &ids {
            if let Ok(item) = state.db.media(*id) {
                if let Err(err) = std::fs::remove_file(&item.path) {
                    eprintln!("[media-manager] 删除文件失败 {}: {err}", item.path);
                }
            }
        }
    }
    state.db.delete_media(&ids)
}

#[tauri::command]
pub fn clean_missing(state: State<'_, AppState>) -> Result<usize> {
    state.db.clean_missing()
}

#[tauri::command]
pub fn stats(state: State<'_, AppState>) -> Result<Stats> {
    state.db.stats()
}

// ---------------------------------------------------------------------------
// 设置
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    state.db.settings()
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings> {
    state.db.save_settings(&settings)?;
    Ok(settings)
}

// ---------------------------------------------------------------------------
// 文件操作
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<()> {
    tauri_plugin_opener::reveal_item_in_dir(&path)
        .map_err(|err| AppError::msg(format!("打开所在目录失败: {err}")))
}

#[tauri::command]
pub fn open_with_default(path: String) -> Result<()> {
    tauri_plugin_opener::open_path(&path, None::<&str>)
        .map_err(|err| AppError::msg(format!("打开文件失败: {err}")))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}
