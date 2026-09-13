import type { MediaQuery } from "../lib/types";

interface Props {
  query: MediaQuery;
  search: string;
  total: number;
  view: "grid" | "list";
  scanning: boolean;
  onSearch: (value: string) => void;
  onQueryChange: (patch: Partial<MediaQuery>) => void;
  onViewChange: (view: "grid" | "list") => void;
  onScanAll: () => void;
  onCancelScan: () => void;
  onCleanMissing: () => void;
}

export default function Toolbar({
  query,
  search,
  total,
  view,
  scanning,
  onSearch,
  onQueryChange,
  onViewChange,
  onScanAll,
  onCancelScan,
  onCleanMissing,
}: Props) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          value={search}
          placeholder="搜索文件名 / 路径，Ctrl+R 刷新列表"
          onChange={(event) => onSearch(event.target.value)}
        />
        {search && (
          <button className="icon-btn" title="清空" onClick={() => onSearch("")}>
            ✕
          </button>
        )}
      </div>

      <select
        className="select"
        value={query.sort ?? "mtime"}
        onChange={(event) =>
          onQueryChange({ sort: event.target.value as NonNullable<MediaQuery["sort"]> })
        }
      >
        <option value="mtime">按修改时间</option>
        <option value="created">按入库时间</option>
        <option value="title">按名称</option>
        <option value="size">按大小</option>
        <option value="kind">按类型</option>
      </select>

      <select
        className="select"
        value={query.order ?? "desc"}
        onChange={(event) =>
          onQueryChange({ order: event.target.value as NonNullable<MediaQuery["order"]> })
        }
      >
        <option value="desc">降序</option>
        <option value="asc">升序</option>
      </select>

      <div className="spacer" />

      <span className="result-count">{total.toLocaleString()} 项结果</span>

      <div className="view-switch">
        <button
          className={view === "grid" ? "active" : ""}
          title="网格视图"
          onClick={() => onViewChange("grid")}
        >
          ▦
        </button>
        <button
          className={view === "list" ? "active" : ""}
          title="列表视图"
          onClick={() => onViewChange("list")}
        >
          ☰
        </button>
      </div>

      <button className="ghost-btn" onClick={onCleanMissing} title="删除所有失效记录">
        清理失效
      </button>

      {scanning ? (
        <button className="primary-btn danger" onClick={onCancelScan}>
          停止扫描
        </button>
      ) : (
        <button className="primary-btn" onClick={onScanAll}>
          扫描全部
        </button>
      )}
    </div>
  );
}
