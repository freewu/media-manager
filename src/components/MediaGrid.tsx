import type { MediaItem } from "../lib/types";
import { fileUrl, formatBytes, formatDate, kindIcon, kindLabel, shortenPath } from "../lib/format";

interface Props {
  items: MediaItem[];
  view: "grid" | "list";
  loading: boolean;
  selectedId: number | null;
  hasMore: boolean;
  total: number;
  onSelect: (item: MediaItem) => void;
  onOpen: (item: MediaItem) => void;
  onReveal: (item: MediaItem) => void;
  onToggleFavorite: (item: MediaItem) => void;
  onLoadMore: () => void;
}

function Thumb({ item, size }: { item: MediaItem; size: "card" | "row" }) {
  if (item.kind === "image" && !item.missing) {
    return (
      <img
        className={`thumb thumb-${size}`}
        src={fileUrl(item.path)}
        alt={item.title}
        loading="lazy"
        draggable={false}
      />
    );
  }
  return (
    <div className={`thumb thumb-${size} thumb-fallback kind-${item.kind}`}>
      <span className="thumb-icon">{kindIcon(item.kind)}</span>
      {size === "card" && <span className="thumb-ext">{item.ext.toUpperCase()}</span>}
    </div>
  );
}

export default function MediaGrid({
  items,
  view,
  loading,
  selectedId,
  hasMore,
  total,
  onSelect,
  onOpen,
  onReveal,
  onToggleFavorite,
  onLoadMore,
}: Props) {
  if (!loading && items.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">🎞️</div>
        <h3>这里还没有媒体资源</h3>
        <p>
          在左侧添加一个扫描目录，程序会递归扫描并把匹配的媒体文件写入 SQLite，
          数据保存在应用目录下的 <code>.data/data.db</code>。
        </p>
      </div>
    );
  }

  return (
    <div className="content">
      <div className={view === "grid" ? "grid" : "list"}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`${view === "grid" ? "card" : "row"} ${
              selectedId === item.id ? "selected" : ""
            } ${item.missing ? "missing" : ""}`}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onOpen(item)}
            title={item.path}
          >
            <Thumb item={item} size={view === "grid" ? "card" : "row"} />

            <div className="meta">
              <div className="meta-title">
                {item.favorite && <span className="star">★</span>}
                <span className="title-text">{item.title}</span>
              </div>
              <div className="meta-sub">
                <span className="tag-ext">{item.ext.toUpperCase()}</span>
                <span>{kindLabel(item.kind)}</span>
                <span>{formatBytes(item.size)}</span>
                <span>{formatDate(item.mtime)}</span>
              </div>
              <div className="meta-path">{shortenPath(item.dir, 2)}</div>
              {item.tags.length > 0 && (
                <div className="meta-tags">
                  {item.tags.slice(0, 4).map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="card-actions">
              <button
                className={`icon-btn ${item.favorite ? "active" : ""}`}
                title={item.favorite ? "取消收藏" : "收藏"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(item);
                }}
              >
                ★
              </button>
              <button
                className="icon-btn"
                title="在资源管理器中显示"
                onClick={(event) => {
                  event.stopPropagation();
                  onReveal(item);
                }}
              >
                📂
              </button>
            </div>

            {item.missing && <div className="missing-badge">文件已丢失</div>}
          </div>
        ))}
      </div>

      <div className="load-more">
        {hasMore ? (
          <button className="ghost-btn" disabled={loading} onClick={onLoadMore}>
            {loading ? "加载中…" : `加载更多（已显示 ${items.length} / ${total}）`}
          </button>
        ) : (
          <span className="muted">已显示全部 {total.toLocaleString()} 项</span>
        )}
      </div>
    </div>
  );
}
