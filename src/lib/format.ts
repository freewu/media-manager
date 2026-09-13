import { convertFileSrc } from "@tauri-apps/api/core";

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} 分 ${s} 秒`;
}

export const KIND_LABELS: Record<string, string> = {
  video: "视频",
  audio: "音频",
  image: "图片",
  document: "文档",
};

export const KIND_ICONS: Record<string, string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼️",
  document: "📄",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "其它";
}

export function kindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? "📦";
}

/** 本地文件 -> 可被 WebView 加载的 asset 地址 */
export function fileUrl(path: string): string {
  return convertFileSrc(path);
}

/** 只保留路径的最后两级，用于列表里紧凑展示 */
export function shortenPath(path: string, depth = 2): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= depth) return path;
  return `…/${parts.slice(-depth).join("/")}`;
}
