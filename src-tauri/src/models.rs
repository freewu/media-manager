use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 扫描目录（媒体库）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub enabled: bool,
    pub created_at: i64,
    pub last_scan_at: Option<i64>,
    pub media_count: i64,
    pub total_size: i64,
}

/// 一条媒体资源记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: i64,
    pub library_id: i64,
    pub library_name: Option<String>,
    pub path: String,
    pub dir: String,
    pub file_name: String,
    pub title: String,
    pub ext: String,
    pub kind: String,
    pub size: i64,
    pub mtime: i64,
    pub duration: Option<f64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub missing: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 列表查询条件
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MediaQuery {
    pub library_id: Option<i64>,
    pub kind: Option<String>,
    pub search: Option<String>,
    pub favorite: Option<bool>,
    /// true = 只看失效记录, false = 只看有效记录, None = 全部
    pub missing: Option<bool>,
    /// title | size | mtime | created | kind
    pub sort: Option<String>,
    /// asc | desc
    pub order: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPage {
    pub items: Vec<MediaItem>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KindStat {
    pub kind: String,
    pub count: i64,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: i64,
    pub total_size: i64,
    pub favorite: i64,
    pub missing: i64,
    pub libraries: i64,
    pub last_scan_at: Option<i64>,
    pub by_kind: Vec<KindStat>,
}

/// 扫描进度（通过 scan://progress 事件推送给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub running: bool,
    pub finished: bool,
    pub cancelled: bool,
    pub library_id: Option<i64>,
    pub library_name: String,
    pub library_index: usize,
    pub library_count: usize,
    pub scanned: u64,
    pub added: u64,
    pub updated: u64,
    pub skipped: u64,
    pub missing: u64,
    pub failed: u64,
    pub current: String,
    pub elapsed_ms: u64,
}

/// 扫描结束后的汇总
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub scanned: u64,
    pub added: u64,
    pub updated: u64,
    pub skipped: u64,
    pub missing: u64,
    pub failed: u64,
    pub elapsed_ms: u64,
    pub cancelled: bool,
    pub libraries: usize,
}

/// 用户可配置项（存在 settings 表的 JSON 里）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// 参与扫描的媒体类型
    pub kinds: Vec<String>,
    /// 各类型对应的扩展名（不带点，小写）
    pub extensions: HashMap<String, Vec<String>>,
    /// 跳过隐藏文件 / 目录
    pub skip_hidden: bool,
    /// 是否跟随符号链接
    pub follow_symlinks: bool,
    /// 忽略的目录名
    pub ignore_dirs: Vec<String>,
    /// 小于该大小的文件不入库（KB，0 表示不限制）
    pub min_size_kb: i64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            kinds: crate::media::ALL_KINDS
                .iter()
                .filter(|k| **k != crate::media::KIND_DOCUMENT)
                .map(|k| k.to_string())
                .collect(),
            extensions: crate::media::default_extensions(),
            skip_hidden: true,
            follow_symlinks: false,
            ignore_dirs: vec![
                "$RECYCLE.BIN".into(),
                "System Volume Information".into(),
                "node_modules".into(),
                ".git".into(),
            ],
            min_size_kb: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub platform: String,
    pub db_path: String,
    pub data_dir: String,
    pub sqlite_version: String,
}
