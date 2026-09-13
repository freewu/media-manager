export type MediaKind = "video" | "audio" | "image" | "document";

export interface Library {
  id: number;
  path: string;
  name: string;
  enabled: boolean;
  createdAt: number;
  lastScanAt: number | null;
  mediaCount: number;
  totalSize: number;
}

export interface MediaItem {
  id: number;
  libraryId: number;
  libraryName: string | null;
  path: string;
  dir: string;
  fileName: string;
  title: string;
  ext: string;
  kind: MediaKind | string;
  size: number;
  mtime: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  tags: string[];
  favorite: boolean;
  missing: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MediaQuery {
  libraryId?: number | null;
  kind?: string | null;
  search?: string | null;
  favorite?: boolean | null;
  missing?: boolean | null;
  sort?: "title" | "size" | "mtime" | "created" | "kind";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
}

export interface KindStat {
  kind: string;
  count: number;
  size: number;
}

export interface Stats {
  total: number;
  totalSize: number;
  favorite: number;
  missing: number;
  libraries: number;
  lastScanAt: number | null;
  byKind: KindStat[];
}

export interface ScanProgress {
  running: boolean;
  finished: boolean;
  cancelled: boolean;
  libraryId: number | null;
  libraryName: string;
  libraryIndex: number;
  libraryCount: number;
  scanned: number;
  added: number;
  updated: number;
  skipped: number;
  missing: number;
  failed: number;
  current: string;
  elapsedMs: number;
}

export interface ScanSummary {
  scanned: number;
  added: number;
  updated: number;
  skipped: number;
  missing: number;
  failed: number;
  elapsedMs: number;
  cancelled: boolean;
  libraries: number;
}

export interface Settings {
  kinds: string[];
  extensions: Record<string, string[]>;
  skipHidden: boolean;
  followSymlinks: boolean;
  ignoreDirs: string[];
  minSizeKb: number;
}

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  platform: string;
  dbPath: string;
  dataDir: string;
  sqliteVersion: string;
}
