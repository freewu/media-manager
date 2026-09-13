import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage, onScanDone, onScanProgress } from "./lib/api";
import type {
  AppInfo,
  Library,
  MediaItem,
  MediaQuery,
  ScanProgress,
  ScanSummary,
  Settings,
  Stats,
} from "./lib/types";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import MediaGrid from "./components/MediaGrid";
import DetailPanel from "./components/DetailPanel";
import SettingsDialog from "./components/SettingsDialog";
import ScanBar from "./components/ScanBar";
import { formatElapsed } from "./lib/format";

const PAGE_SIZE = 120;

type ToastKind = "info" | "success" | "error";

interface Toast {
  text: string;
  kind: ToastKind;
}

const DEFAULT_QUERY: MediaQuery = {
  kind: "all",
  sort: "mtime",
  order: "desc",
  search: "",
};

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [query, setQuery] = useState<MediaQuery>(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((text: string, kind: ToastKind = "info") => {
    setToast({ text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), kind === "error" ? 6000 : 3200);
  }, []);

  // ---------------------------------------------------------------- 数据加载

  const refreshMeta = useCallback(async () => {
    try {
      const [libs, stat] = await Promise.all([api.listLibraries(), api.stats()]);
      setLibraries(libs);
      setStats(stat);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [notify]);

  const loadPage = useCallback(
    async (target: MediaQuery, pageIndex: number) => {
      setLoading(true);
      try {
        const result = await api.listMedia({
          ...target,
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
        });
        setItems((prev) => (pageIndex === 0 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
      } catch (error) {
        notify(errorMessage(error), "error");
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [appInfo, libs, stat, cfg] = await Promise.all([
          api.appInfo(),
          api.listLibraries(),
          api.stats(),
          api.getSettings(),
        ]);
        setInfo(appInfo);
        setLibraries(libs);
        setStats(stat);
        setSettings(cfg);
        setScanning(await api.scanStatus());
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    })();
  }, [notify]);

  useEffect(() => {
    void loadPage(query, page);
  }, [query, page, loadPage]);

  // 搜索防抖
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput },
      );
      setPage(0);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // 扫描事件
  useEffect(() => {
    const unlisten: Array<() => void> = [];

    void onScanProgress((payload) => {
      setProgress(payload);
      setScanning(payload.running);
    }).then((fn) => unlisten.push(fn));

    void onScanDone((summary: ScanSummary) => {
      setScanning(false);
      setProgress((prev) => (prev ? { ...prev, running: false, finished: true } : prev));
      window.setTimeout(() => setProgress(null), 2500);
      void refreshMeta();
      void loadPage(query, 0);
      setPage(0);
      notify(
        summary.cancelled
          ? `扫描已取消，处理 ${summary.scanned} 个文件`
          : `扫描完成：新增 ${summary.added}，更新 ${summary.updated}，失效 ${summary.missing}，用时 ${formatElapsed(
              summary.elapsedMs,
            )}`,
        summary.cancelled ? "info" : "success",
      );
    }).then((fn) => unlisten.push(fn));

    return () => unlisten.forEach((fn) => fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, refreshMeta, loadPage, notify]);

  // 快捷键
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setShowSettings(false);
      }
      if (event.key === "F5" || (event.ctrlKey && event.key.toLowerCase() === "r")) {
        event.preventDefault();
        void refreshMeta();
        void loadPage(query, 0);
        setPage(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadPage, query, refreshMeta]);

  // ---------------------------------------------------------------- 操作

  const updateQuery = useCallback((patch: Partial<MediaQuery>) => {
    setQuery((prev) => ({ ...prev, ...patch }));
    setPage(0);
  }, []);

  const startScan = useCallback(
    async (libraryIds?: number[]) => {
      try {
        await api.scan(libraryIds);
        setScanning(true);
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  const handleAddLibrary = useCallback(async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: "选择要扫描的目录",
      });
      if (typeof picked !== "string") return;
      const library = await api.addLibrary(picked);
      await refreshMeta();
      notify(`已添加扫描目录：${library.name}`, "success");
      await startScan([library.id]);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [notify, refreshMeta, startScan]);

  const handleCancelScan = useCallback(async () => {
    try {
      await api.cancelScan();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [notify]);

  const handleRemoveLibrary = useCallback(
    async (library: Library) => {
      const ok = window.confirm(
        `确定移除扫描目录「${library.name}」吗？\n数据库中属于该目录的 ${library.mediaCount} 条记录会被一起删除（磁盘文件不受影响）。`,
      );
      if (!ok) return;
      try {
        await api.removeLibrary(library.id);
        await refreshMeta();
        updateQuery({ libraryId: null });
        notify("已移除扫描目录", "success");
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify, refreshMeta, updateQuery],
  );

  const handleToggleLibrary = useCallback(
    async (library: Library) => {
      try {
        await api.setLibraryEnabled(library.id, !library.enabled);
        await refreshMeta();
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify, refreshMeta],
  );

  const handleUpdateSelected = useCallback(
    async (patch: { title?: string; tags?: string[]; favorite?: boolean }) => {
      if (!selected) return;
      try {
        const updated = await api.updateMedia(selected.id, patch);
        setSelected(updated);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        void refreshMeta();
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify, refreshMeta, selected],
  );

  const handleDelete = useCallback(
    async (item: MediaItem, deleteFiles: boolean) => {
      const message = deleteFiles
        ? `确定删除磁盘文件吗？\n${item.path}\n此操作不可恢复！`
        : `确定从媒体库移除记录吗？（磁盘文件保留）\n${item.fileName}`;
      if (!window.confirm(message)) return;
      try {
        await api.deleteMedia([item.id], deleteFiles);
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        setTotal((prev) => Math.max(0, prev - 1));
        setSelected(null);
        await refreshMeta();
        notify(deleteFiles ? "文件已删除" : "记录已移除", "success");
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify, refreshMeta],
  );

  const handleToggleFavorite = useCallback(
    async (item: MediaItem) => {
      try {
        const updated = await api.updateMedia(item.id, { favorite: !item.favorite });
        setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setSelected((prev) => (prev && prev.id === updated.id ? updated : prev));
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  const handleCleanMissing = useCallback(async () => {
    try {
      const removed = await api.cleanMissing();
      await refreshMeta();
      void loadPage(query, 0);
      setPage(0);
      notify(removed > 0 ? `已清理 ${removed} 条失效记录` : "没有失效记录", "success");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [loadPage, notify, query, refreshMeta]);

  const handleSaveSettings = useCallback(
    async (next: Settings) => {
      try {
        const saved = await api.saveSettings(next);
        setSettings(saved);
        setShowSettings(false);
        notify("设置已保存，重新扫描后生效", "success");
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  const handleReveal = useCallback(
    async (item: MediaItem) => {
      try {
        await api.revealInExplorer(item.path);
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  const handleOpen = useCallback(
    async (item: MediaItem) => {
      try {
        await api.openWithDefault(item.path);
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  // ---------------------------------------------------------------- 渲染

  return (
    <div className="app">
      <Sidebar
        info={info}
        libraries={libraries}
        stats={stats}
        query={query}
        scanning={scanning}
        onSelect={updateQuery}
        onAddLibrary={handleAddLibrary}
        onScanLibrary={(id) => void startScan([id])}
        onScanAll={() => void startScan()}
        onToggleLibrary={(lib) => void handleToggleLibrary(lib)}
        onRemoveLibrary={(lib) => void handleRemoveLibrary(lib)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <Toolbar
          query={query}
          search={searchInput}
          total={total}
          view={view}
          scanning={scanning}
          onSearch={setSearchInput}
          onQueryChange={updateQuery}
          onViewChange={setView}
          onScanAll={() => void startScan()}
          onCancelScan={() => void handleCancelScan()}
          onCleanMissing={() => void handleCleanMissing()}
        />

        {progress && <ScanBar progress={progress} />}

        <MediaGrid
          items={items}
          view={view}
          loading={loading}
          selectedId={selected?.id ?? null}
          hasMore={items.length < total}
          total={total}
          onSelect={setSelected}
          onOpen={(item) => void handleOpen(item)}
          onReveal={(item) => void handleReveal(item)}
          onToggleFavorite={(item) => void handleToggleFavorite(item)}
          onLoadMore={() => setPage((prev) => prev + 1)}
        />
      </main>

      {selected && (
        <DetailPanel
          item={selected}
          onClose={() => setSelected(null)}
          onUpdate={(patch) => void handleUpdateSelected(patch)}
          onOpen={() => void handleOpen(selected)}
          onReveal={() => void handleReveal(selected)}
          onDelete={(deleteFiles) => void handleDelete(selected, deleteFiles)}
        />
      )}

      {showSettings && settings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(next) => void handleSaveSettings(next)}
        />
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
