//! 端到端 / 数据层集成测试。
//!
//! 为什么放在 `tests/` 而不是 lib 里？`cargo test` 为 lib/bin 生成的单元测试可执行文件
//! 不会带上 tauri-build 嵌入的 Windows 清单，缺少 comctl32 v6 声明时进程会在启动阶段
//! 直接以 STATUS_ENTRYPOINT_NOT_FOUND 退出（见 build.rs）。集成测试目标会补上清单，
//! 因此 rust 侧测试统一写在这里。
//!
//! 运行：`cargo test`（或 `cargo test --test core`）

use media_manager_lib::db::{join_tags, now_ms, parse_tags, Db};
use media_manager_lib::models::MediaQuery;
use media_manager_lib::scanner::{scan, ScanState};
use rusqlite::params;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use std::fs;
use std::io::Write;

#[test]
fn library_links() {
    assert!(!media_manager_lib::version().is_empty());
}

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "media-manager-{tag}-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_file(path: &Path, bytes: usize) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut file = fs::File::create(path).unwrap();
    file.write_all(&vec![0u8; bytes]).unwrap();
}

#[test]
fn scan_indexes_media_files() {
    let root = temp_dir("scan-root");
    write_file(&root.join("alpha.mp4"), 128);
    write_file(&root.join("sub/beta.mp3"), 64);
    write_file(&root.join("sub/deep/gamma.JPG"), 32); // 大写扩展名也要识别
    write_file(&root.join("ignored.txt"), 16); // 不在白名单
    write_file(&root.join(".hidden.mp4"), 16); // 默认跳过隐藏文件

    let db = Arc::new(Db::open(&root.join("data.db")).unwrap());
    let library = db.add_library(&root).unwrap();

    let app = tauri::test::mock_app();
    let state = Arc::new(ScanState::new());

    // 首次扫描：3 个媒体文件入库
    let first = scan(app.handle().clone(), db.clone(), state.clone(), None);
    assert_eq!(first.added, 3, "首次扫描应写入 3 条");
    assert_eq!(first.failed, 0);
    assert_eq!(db.stats().unwrap().total, 3);

    // 内容未变化 -> 全部跳过，不产生重复记录
    let second = scan(app.handle().clone(), db.clone(), state.clone(), None);
    assert_eq!(second.added, 0);
    assert_eq!(second.skipped, 3);
    assert_eq!(db.stats().unwrap().total, 3);

    // 文件被删除 -> 记录标记为失效
    fs::remove_file(root.join("alpha.mp4")).unwrap();
    let third = scan(app.handle().clone(), db.clone(), state.clone(), None);
    assert_eq!(third.missing, 1);
    assert_eq!(db.stats().unwrap().missing, 1);

    // 按类型过滤查询（扩展名已统一成小写）
    let images = db
        .media_page(&MediaQuery {
            kind: Some("image".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(images.0.len(), 1);
    assert_eq!(images.0[0].ext, "jpg");
    assert_eq!(images.0[0].title, "gamma");
    assert_eq!(images.1, 1);

    // 名称搜索（"beta" 只出现在 sub\beta.mp3 的路径里）
    let found = db
        .media_page(&MediaQuery {
            search: Some("beta".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(found.0.len(), 1);
    assert_eq!(found.0[0].title, "beta");

    // 更新标签 / 收藏
    let item = &images.0[0];
    let updated = db
        .update_media(
            item.id,
            None,
            Some(vec!["风景".into(), "测试".into()]),
            Some(true),
        )
        .unwrap();
    assert_eq!(updated.tags, vec!["测试".to_string(), "风景".to_string()]);
    assert!(updated.favorite);

    // 扫描状态互斥
    assert!(!state.is_running());

    // 清理失效记录
    assert_eq!(db.clean_missing().unwrap(), 1);
    assert_eq!(db.stats().unwrap().total, 2);
    assert_eq!(db.library(library.id).unwrap().media_count, 2);

    let _ = fs::remove_dir_all(&root);
}

#[test]
fn scan_respects_min_size_and_disabled_library() {
    let root = temp_dir("scan-filter");
    write_file(&root.join("small.mp4"), 8);
    write_file(&root.join("big.mp4"), 4096);

    let db = Arc::new(Db::open(&root.join("data.db")).unwrap());
    let library = db.add_library(&root).unwrap();

    let mut settings = db.settings().unwrap();
    settings.min_size_kb = 1; // 小于 1KB 的忽略
    db.save_settings(&settings).unwrap();

    let app = tauri::test::mock_app();
    let state = Arc::new(ScanState::new());

    let summary = scan(app.handle().clone(), db.clone(), state.clone(), None);
    assert_eq!(summary.added, 1);
    assert_eq!(summary.skipped, 1);

    // 停用媒体库后不再参与扫描
    db.set_library_enabled(library.id, false).unwrap();
    let summary = scan(app.handle().clone(), db.clone(), state.clone(), None);
    assert_eq!(summary.libraries, 0);
    assert_eq!(summary.scanned, 0);

    let _ = fs::remove_dir_all(&root);
}

fn temp_db(tag: &str) -> (Db, PathBuf) {
    let dir = std::env::temp_dir().join(format!(
        "media-manager-db-{tag}-{}-{}",
        std::process::id(),
        now_ms()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let db = Db::open(&dir.join("data.db")).unwrap();
    (db, dir)
}

fn insert_media(db: &Db, library_id: i64, path: &str, kind: &str, size: i64) {
    let conn = db.lock();
    conn.execute(
        "INSERT INTO media
            (library_id, path, dir, file_name, title, ext, kind, size, mtime,
             tags, favorite, missing, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', 0, 0, ?9, ?9)",
        params![
            library_id,
            path,
            "C:\\media",
            path,
            path,
            "mp4",
            kind,
            size,
            1_700_000_000_000i64
        ],
    )
    .unwrap();
}

#[test]
fn schema_and_settings_defaults() {
    let (db, dir) = temp_db("schema");
    let settings = db.settings().unwrap();
    assert!(settings.kinds.contains(&"video".to_string()));
    assert!(!settings.kinds.contains(&"document".to_string()));
    assert!(settings.skip_hidden);

    let mut changed = settings.clone();
    changed.min_size_kb = 512;
    db.save_settings(&changed).unwrap();
    assert_eq!(db.settings().unwrap().min_size_kb, 512);

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn media_filters_paging_and_cleanup() {
    let (db, dir) = temp_db("query");
    let library = db.add_library(&dir).unwrap();
    assert_eq!(db.libraries().unwrap().len(), 1);

    insert_media(&db, library.id, "alpha.mp4", "video", 100);
    insert_media(&db, library.id, "beta.mp3", "audio", 300);
    insert_media(&db, library.id, "gamma.mp4", "video", 200);

    let all = db.media_page(&MediaQuery::default()).unwrap();
    assert_eq!(all.1, 3);
    assert_eq!(all.0.len(), 3);

    // 分页
    let page = db
        .media_page(&MediaQuery {
            limit: Some(2),
            offset: Some(2),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(page.0.len(), 1);
    assert_eq!(page.1, 3);

    // 按类型过滤
    let videos = db
        .media_page(&MediaQuery {
            kind: Some("video".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(videos.0.len(), 2);

    // 搜索 + 排序
    let searched = db
        .media_page(&MediaQuery {
            search: Some("gamma".into()),
            sort: Some("size".into()),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(searched.0.len(), 1);
    assert_eq!(searched.0[0].size, 200);

    // 收藏过滤
    let item = &searched.0[0];
    db.update_media(item.id, None, Some(vec!["高清".into()]), Some(true))
        .unwrap();
    let favorites = db
        .media_page(&MediaQuery {
            favorite: Some(true),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(favorites.0.len(), 1);
    assert_eq!(favorites.0[0].tags, vec!["高清".to_string()]);

    // 失效记录清理
    {
        let conn = db.lock();
        conn.execute(
            "UPDATE media SET missing = 1 WHERE path = ?1",
            params!["alpha.mp4"],
        )
        .unwrap();
    }
    assert_eq!(db.stats().unwrap().missing, 1);
    assert_eq!(db.clean_missing().unwrap(), 1);
    assert_eq!(db.stats().unwrap().total, 2);

    // 删除记录
    assert_eq!(db.delete_media(&[item.id]).unwrap(), 1);
    assert_eq!(db.stats().unwrap().total, 1);

    // 删除媒体库会级联删除其下的媒体记录
    db.remove_library(library.id).unwrap();
    assert_eq!(db.stats().unwrap().total, 0);

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn tag_helpers_trim_and_dedupe() {
    assert_eq!(
        join_tags(&[" b ".into(), "a".into(), "b".into(), "".into()]),
        "a,b"
    );
    assert_eq!(parse_tags("a, b ,,c"), vec!["a", "b", "c"]);
}
