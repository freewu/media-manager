import { useEffect, useState } from "react";
import type { MediaItem } from "../lib/types";
import { fileUrl, formatBytes, formatDate, formatDuration, kindIcon, kindLabel } from "../lib/format";

interface Props {
  item: MediaItem;
  onClose: () => void;
  onUpdate: (patch: { title?: string; tags?: string[]; favorite?: boolean }) => void;
  onOpen: () => void;
  onReveal: () => void;
  onDelete: (deleteFiles: boolean) => void;
}

export default function DetailPanel({
  item,
  onClose,
  onUpdate,
  onOpen,
  onReveal,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(item.title);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    setTitle(item.title);
    setTagInput("");
  }, [item.id, item.title]);

  const src = fileUrl(item.path);

  const addTag = () => {
    const value = tagInput.trim();
    if (!value || item.tags.includes(value)) {
      setTagInput("");
      return;
    }
    onUpdate({ tags: [...item.tags, value] });
    setTagInput("");
  };

  return (
    <aside className="detail">
      <header className="detail-head">
        <div className="detail-title" title={item.fileName}>
          {kindIcon(item.kind)} {item.title}
        </div>
        <button className="icon-btn" title="关闭 (Esc)" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="preview">
        {item.missing ? (
          <div className="preview-missing">⚠️ 文件已不存在，请重新扫描或清理记录</div>
        ) : item.kind === "image" ? (
          <img src={src} alt={item.title} />
        ) : item.kind === "video" ? (
          <video src={src} controls preload="metadata" />
        ) : item.kind === "audio" ? (
          <div className="audio-preview">
            <div className="audio-icon">🎵</div>
            <audio src={src} controls preload="metadata" />
          </div>
        ) : (
          <div className="preview-missing">该类型暂不支持内嵌预览</div>
        )}
      </div>

      <div className="detail-actions">
        <button className="ghost-btn" onClick={onOpen} disabled={item.missing}>
          ▶ 打开文件
        </button>
        <button className="ghost-btn" onClick={onReveal}>
          📂 所在目录
        </button>
        <button
          className={`ghost-btn ${item.favorite ? "active" : ""}`}
          onClick={() => onUpdate({ favorite: !item.favorite })}
        >
          {item.favorite ? "★ 已收藏" : "☆ 收藏"}
        </button>
      </div>

      <section className="detail-section">
        <h4>标题</h4>
        <div className="inline-form">
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
          <button
            className="ghost-btn"
            disabled={title.trim() === item.title || title.trim() === ""}
            onClick={() => onUpdate({ title: title.trim() })}
          >
            保存
          </button>
        </div>
      </section>

      <section className="detail-section">
        <h4>标签</h4>
        <div className="tags">
          {item.tags.map((tag) => (
            <span className="chip removable" key={tag}>
              {tag}
              <button onClick={() => onUpdate({ tags: item.tags.filter((t) => t !== tag) })}>
                ✕
              </button>
            </span>
          ))}
          {item.tags.length === 0 && <span className="muted">暂无标签</span>}
        </div>
        <div className="inline-form">
          <input
            value={tagInput}
            placeholder="输入标签后回车"
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addTag();
            }}
          />
          <button className="ghost-btn" onClick={addTag} disabled={!tagInput.trim()}>
            添加
          </button>
        </div>
      </section>

      <section className="detail-section">
        <h4>信息</h4>
        <dl className="info">
          <dt>类型</dt>
          <dd>
            {kindLabel(item.kind)} · {item.ext.toUpperCase()}
          </dd>
          <dt>大小</dt>
          <dd>{formatBytes(item.size)}</dd>
          {item.duration ? (
            <>
              <dt>时长</dt>
              <dd>{formatDuration(item.duration)}</dd>
            </>
          ) : null}
          <dt>修改时间</dt>
          <dd>{formatDate(item.mtime)}</dd>
          <dt>入库时间</dt>
          <dd>{formatDate(item.createdAt)}</dd>
          <dt>媒体库</dt>
          <dd>{item.libraryName ?? "—"}</dd>
          <dt>文件名</dt>
          <dd className="break">{item.fileName}</dd>
          <dt>完整路径</dt>
          <dd className="break mono">{item.path}</dd>
        </dl>
      </section>

      <section className="detail-section danger-zone">
        <h4>危险操作</h4>
        <div className="detail-actions">
          <button className="ghost-btn danger" onClick={() => onDelete(false)}>
            从媒体库移除
          </button>
          <button className="ghost-btn danger" onClick={() => onDelete(true)}>
            删除磁盘文件
          </button>
        </div>
      </section>
    </aside>
  );
}
