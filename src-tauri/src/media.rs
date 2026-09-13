use crate::models::Settings;
use std::collections::HashMap;
use std::path::Path;

pub const KIND_VIDEO: &str = "video";
pub const KIND_AUDIO: &str = "audio";
pub const KIND_IMAGE: &str = "image";
pub const KIND_DOCUMENT: &str = "document";

pub const ALL_KINDS: [&str; 4] = [KIND_VIDEO, KIND_AUDIO, KIND_IMAGE, KIND_DOCUMENT];

/// 内置的扩展名白名单（用户可在设置里覆盖）
pub fn default_extensions() -> HashMap<String, Vec<String>> {
    let list = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    HashMap::from([
        (
            KIND_VIDEO.to_string(),
            list(&[
                "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg", "ts",
                "rmvb", "rm", "3gp", "vob", "m2ts", "f4v",
            ]),
        ),
        (
            KIND_AUDIO.to_string(),
            list(&[
                "mp3", "flac", "wav", "aac", "m4a", "ogg", "oga", "wma", "opus", "ape", "aiff",
                "alac", "mid", "amr",
            ]),
        ),
        (
            KIND_IMAGE.to_string(),
            list(&[
                "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic", "heif",
                "avif", "ico", "jfif", "raw", "cr2", "nef", "arw", "dng",
            ]),
        ),
        (
            KIND_DOCUMENT.to_string(),
            list(&["pdf", "epub", "mobi", "txt", "md", "cbz", "cbr"]),
        ),
    ])
}

/// 取某个类型的内置扩展名
pub fn default_extensions_of(kind: &str) -> Vec<String> {
    default_extensions().remove(kind).unwrap_or_default()
}

/// 取路径的扩展名：小写、不带点
pub fn extension_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// 根据设置构建 "扩展名 -> 媒体类型" 的索引
pub fn build_index(settings: &Settings) -> HashMap<String, String> {
    let mut index = HashMap::new();
    for kind in &settings.kinds {
        let exts = settings
            .extensions
            .get(kind)
            .filter(|v| !v.is_empty())
            .cloned()
            .unwrap_or_else(|| default_extensions_of(kind));
        for ext in exts {
            index.insert(
                ext.trim().trim_start_matches('.').to_ascii_lowercase(),
                kind.clone(),
            );
        }
    }
    index
}
