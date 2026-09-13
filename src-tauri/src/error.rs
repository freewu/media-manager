use serde::Serialize;

pub type Result<T> = std::result::Result<T, AppError>;

/// 统一错误类型：所有 Tauri 命令都返回它，前端拿到的是一段可读的中文消息。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("文件系统错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("数据解析错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Tauri 错误: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Message(String),
}

impl AppError {
    pub fn msg(message: impl Into<String>) -> Self {
        AppError::Message(message.into())
    }

    pub fn not_found(what: impl Into<String>) -> Self {
        AppError::Message(format!("未找到: {}", what.into()))
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
