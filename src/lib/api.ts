import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  Library,
  MediaItem,
  MediaPage,
  MediaQuery,
  ScanProgress,
  ScanSummary,
  Settings,
  Stats,
} from "./types";

/** Rust 端 #[tauri::command] 的薄封装 */
export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),

  listLibraries: () => invoke<Library[]>("list_libraries"),
  addLibrary: (path: string) => invoke<Library>("add_library", { path }),
  setLibraryEnabled: (id: number, enabled: boolean) =>
    invoke<void>("set_library_enabled", { id, enabled }),
  removeLibrary: (id: number) => invoke<void>("remove_library", { id }),

  scan: (libraryIds?: number[]) =>
    invoke<boolean>("scan", { libraryIds: libraryIds?.length ? libraryIds : null }),
  cancelScan: () => invoke<boolean>("cancel_scan"),
  scanStatus: () => invoke<boolean>("scan_status"),

  listMedia: (query: MediaQuery) => invoke<MediaPage>("list_media", { query }),
  getMedia: (id: number) => invoke<MediaItem>("get_media", { id }),
  updateMedia: (
    id: number,
    patch: { title?: string; tags?: string[]; favorite?: boolean },
  ) => invoke<MediaItem>("update_media", { id, ...patch }),
  deleteMedia: (ids: number[], deleteFiles = false) =>
    invoke<number>("delete_media", { ids, deleteFiles }),
  cleanMissing: () => invoke<number>("clean_missing"),
  stats: () => invoke<Stats>("stats"),

  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),

  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  openWithDefault: (path: string) => invoke<void>("open_with_default", { path }),
  pathExists: (path: string) => invoke<boolean>("path_exists", { path }),
};

export const onScanProgress = (cb: (payload: ScanProgress) => void): Promise<UnlistenFn> =>
  listen<ScanProgress>("scan://progress", (event) => cb(event.payload));

export const onScanDone = (cb: (payload: ScanSummary) => void): Promise<UnlistenFn> =>
  listen<ScanSummary>("scan://done", (event) => cb(event.payload));

/** Rust 端返回的错误本身就是字符串 */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
