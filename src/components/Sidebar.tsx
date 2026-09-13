import type { AppInfo, Library, MediaQuery, Stats } from "../lib/types";
import { formatBytes, formatDate, kindIcon, kindLabel, shortenPath } from "../lib/format";

interface Props {
  info: AppInfo | null;
  libraries: Library[];
  stats: Stats | null;
  query: MediaQuery;
  scanning: boolean;
  onSelect: (patch: Partial<MediaQuery>) => void;
  onAddLibrary: () => void;
  onScanLibrary: (id: number) => void;
  onScanAll: () => void;
  onToggleLibrary: (library: Library) => void;
  onRemoveLibrary: (library: Library) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  info,
  libraries,
  stats,
  query,
  scanning,
  onSelect,
  onAddLibrary,
  onScanLibrary,
  onScanAll,
  onToggleLibrary,
  onRemoveLibrary,
  onOpenSettings,
}: Props) {
  const byKind = new Map((stats?.byKind ?? []).map((item) => [item.kind, item]));
  const isAll = query.kind === "all" && !query.favorite && query.missing == null;
  const isFavorite = query.favorite === true;
  const isMissing = query.missing === true;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-logo">▶</span>
        <div>
          <div className="brand-title">媒体资源管理器</div>
          <div className="brand-sub">
            {stats ? `${stats.total.toLocaleString()} 项 · ${formatBytes(stats.totalSize)}` : "加载中…"}
          </div>
        </div>
      </div>

      <nav className="nav">
        <button
          className={`nav-item ${isAll ? "active" : ""}`}
          onClick={() => onSelect({ kind: "all", favorite: false, missing: null })}
        >
          <span className="nav-icon">🗂️</span>
          <span className="nav-label">全部媒体</span>
          <span className="nav-count">{stats?.total ?? 0}</span>
        </button>

        {["video", "audio", "image", "document"].map((kind) => {
          const stat = byKind.get(kind);
          if (!stat && !["video", "audio", "image"].includes(kind)) return null;
          return (
            <button
              key={kind}
              className={`nav-item ${query.kind === kind ? "active" : ""}`}
              onClick={() => onSelect({ kind, favorite: false, missing: null })}
            >
              <span className="nav-icon">{kindIcon(kind)}</span>
              <span className="nav-label">{kindLabel(kind)}</span>
              <span className="nav-count">{stat?.count ?? 0}</span>
            </button>
          );
        })}

        <button
          className={`nav-item ${isFavorite ? "active" : ""}`}
          onClick={() => onSelect({ kind: "all", favorite: true, missing: null })}
        >
          <span className="nav-icon">⭐</span>
          <span className="nav-label">收藏</span>
          <span className="nav-count">{stats?.favorite ?? 0}</span>
        </button>

        <button
          className={`nav-item ${isMissing ? "active" : ""}`}
          onClick={() => onSelect({ kind: "all", favorite: false, missing: true })}
        >
          <span className="nav-icon">⚠️</span>
          <span className="nav-label">失效记录</span>
          <span className="nav-count">{stats?.missing ?? 0}</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="section-head">
          <span>扫描目录</span>
          <div className="section-actions">
            <button className="icon-btn" title="添加目录" onClick={onAddLibrary}>
              ＋
            </button>
            <button
              className="icon-btn"
              title="扫描全部目录"
              disabled={scanning || libraries.length === 0}
              onClick={onScanAll}
            >
              ⟳
            </button>
          </div>
        </div>

        <div className="library-list">
          {libraries.length === 0 && (
            <div className="library-empty">还没有扫描目录，点击 ＋ 添加</div>
          )}

          {libraries.map((library) => (
            <div
              key={library.id}
              className={`library ${query.libraryId === library.id ? "active" : ""} ${
                library.enabled ? "" : "disabled"
              }`}
            >
              <div
                className="library-main"
                title={library.path}
                onClick={() =>
                  onSelect({
                    libraryId: query.libraryId === library.id ? null : library.id,
                    kind: "all",
                    favorite: false,
                    missing: null,
                  })
                }
              >
                <div className="library-name">
                  {library.enabled ? "📁" : "🚫"} {library.name}
                </div>
                <div className="library-path">{shortenPath(library.path)}</div>
                <div className="library-meta">
                  {library.mediaCount.toLocaleString()} 项 · {formatBytes(library.totalSize)}
                  {library.lastScanAt ? ` · ${formatDate(library.lastScanAt)}` : " · 未扫描"}
                </div>
              </div>

              <div className="library-tools">
                <button
                  className="icon-btn"
                  title="扫描该目录"
                  disabled={scanning}
                  onClick={(event) => {
                    event.stopPropagation();
                    onScanLibrary(library.id);
                  }}
                >
                  ⟳
                </button>
                <button
                  className="icon-btn"
                  title={library.enabled ? "停用（扫描时跳过）" : "启用"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLibrary(library);
                  }}
                >
                  {library.enabled ? "◉" : "○"}
                </button>
                <button
                  className="icon-btn danger"
                  title="移除目录"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveLibrary(library);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="ghost-btn" onClick={onOpenSettings}>
          ⚙ 扫描设置
        </button>
        {info && (
          <div className="db-hint" title={info.dbPath}>
            SQLite {info.sqliteVersion} · {shortenPath(info.dbPath, 3)}
          </div>
        )}
      </div>
    </aside>
  );
}
