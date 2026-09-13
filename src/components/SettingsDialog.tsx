import { useState } from "react";
import type { Settings } from "../lib/types";
import { kindLabel } from "../lib/format";

interface Props {
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => void;
}

const ALL_KINDS = ["video", "audio", "image", "document"];

export default function SettingsDialog({ settings, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Settings>({
    ...settings,
    extensions: { ...settings.extensions },
  });
  const [extDraft, setExtDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ALL_KINDS.map((kind) => [kind, (settings.extensions[kind] ?? []).join(", ")]),
    ),
  );
  const [ignoreText, setIgnoreText] = useState(settings.ignoreDirs.join("\n"));

  const toggleKind = (kind: string) => {
    setDraft((prev) => ({
      ...prev,
      kinds: prev.kinds.includes(kind)
        ? prev.kinds.filter((k) => k !== kind)
        : [...prev.kinds, kind],
    }));
  };

  const submit = () => {
    const extensions: Record<string, string[]> = {};
    for (const kind of ALL_KINDS) {
      const list = (extDraft[kind] ?? "")
        .split(/[\s,;]+/)
        .map((ext) => ext.trim().replace(/^\./, "").toLowerCase())
        .filter(Boolean);
      if (list.length > 0) extensions[kind] = Array.from(new Set(list));
    }
    onSave({
      ...draft,
      extensions,
      ignoreDirs: ignoreText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      minSizeKb: Math.max(0, Math.floor(draft.minSizeKb || 0)),
    });
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h3>扫描设置</h3>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="detail-section">
            <h4>参与扫描的类型</h4>
            <div className="kind-toggles">
              {ALL_KINDS.map((kind) => (
                <label key={kind} className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.kinds.includes(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  {kindLabel(kind)}
                </label>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h4>扩展名（逗号或空格分隔，留空使用内置默认值）</h4>
            {ALL_KINDS.map((kind) => (
              <div className="field" key={kind}>
                <label>{kindLabel(kind)}</label>
                <textarea
                  rows={2}
                  value={extDraft[kind] ?? ""}
                  placeholder="例如 mp4, mkv, avi"
                  onChange={(event) =>
                    setExtDraft((prev) => ({ ...prev, [kind]: event.target.value }))
                  }
                />
              </div>
            ))}
          </section>

          <section className="detail-section">
            <h4>扫描选项</h4>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.skipHidden}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, skipHidden: event.target.checked }))
                }
              />
              跳过隐藏文件 / 目录（以 . 开头）
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.followSymlinks}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, followSymlinks: event.target.checked }))
                }
              />
              跟随符号链接（可能造成循环，慎用）
            </label>

            <div className="field">
              <label>最小文件大小（KB，0 表示不限制）</label>
              <input
                type="number"
                min={0}
                value={draft.minSizeKb}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, minSizeKb: Number(event.target.value) }))
                }
              />
            </div>

            <div className="field">
              <label>忽略的目录名（每行一个）</label>
              <textarea
                rows={4}
                value={ignoreText}
                onChange={(event) => setIgnoreText(event.target.value)}
              />
            </div>
          </section>
        </div>

        <footer className="modal-foot">
          <button className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button className="primary-btn" onClick={submit}>
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}
