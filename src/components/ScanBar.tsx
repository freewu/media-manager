import type { ScanProgress } from "../lib/types";
import { formatElapsed, shortenPath } from "../lib/format";

interface Props {
  progress: ScanProgress;
}

export default function ScanBar({ progress }: Props) {
  const libraryLabel = progress.libraryCount
    ? `${progress.libraryIndex}/${progress.libraryCount} · ${progress.libraryName}`
    : progress.libraryName;

  return (
    <div className={`scan-bar ${progress.cancelled ? "cancelled" : ""}`}>
      {progress.running && <div className="scan-spinner" />}
      <div className="scan-info">
        <div className="scan-line">
          <strong>{progress.cancelled ? "扫描已取消" : progress.running ? "正在扫描" : "扫描结束"}</strong>
          <span className="scan-lib">{libraryLabel}</span>
        </div>
        <div className="scan-current" title={progress.current}>
          {progress.current ? shortenPath(progress.current, 3) : "准备中…"}
        </div>
      </div>

      <div className="scan-stats">
        <span>已处理 <b>{progress.scanned.toLocaleString()}</b></span>
        <span className="ok">新增 <b>{progress.added.toLocaleString()}</b></span>
        <span className="ok">更新 <b>{progress.updated.toLocaleString()}</b></span>
        <span>跳过 <b>{progress.skipped.toLocaleString()}</b></span>
        <span className="warn">失效 <b>{progress.missing.toLocaleString()}</b></span>
        {progress.failed > 0 && <span className="err">失败 <b>{progress.failed}</b></span>}
        <span className="muted">{formatElapsed(progress.elapsedMs)}</span>
      </div>
    </div>
  );
}
