mod commands;
pub mod db;
pub mod error;
pub mod media;
pub mod models;
pub mod scanner;

use crate::commands::AppState;
use crate::db::Db;
use crate::scanner::ScanState;
use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // 数据固定保存在 应用目录/.data/data.db
            let data_dir = db::resolve_data_dir(&handle)?;
            let db_path = data_dir.join("data.db");
            let db = Arc::new(Db::open(&db_path)?);

            // 已入库的目录直接授权给 asset 协议，前端才能预览本地媒体
            for library in db.libraries()? {
                commands::allow_asset_dir(&handle, std::path::Path::new(&library.path));
            }

            println!("[media-manager] 数据库: {}", db_path.display());

            app.manage(AppState {
                db,
                scan: Arc::new(ScanState::new()),
                data_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::list_libraries,
            commands::add_library,
            commands::set_library_enabled,
            commands::remove_library,
            commands::scan,
            commands::cancel_scan,
            commands::scan_status,
            commands::list_media,
            commands::get_media,
            commands::update_media,
            commands::delete_media,
            commands::clean_missing,
            commands::stats,
            commands::get_settings,
            commands::save_settings,
            commands::reveal_in_explorer,
            commands::open_with_default,
            commands::path_exists,
        ])
        .run(tauri::generate_context!())
        .expect("媒体资源管理器启动失败");
}

/// 应用版本号（同时供集成测试引用，确保测试二进制链接到完整依赖）
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
