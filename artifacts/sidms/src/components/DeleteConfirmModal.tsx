import React, { useEffect, useState } from "react";
import { Trash2, X, AlertTriangle } from "lucide-react";

const CONFIRM_WORD = "LÖSCHEN";

interface DeleteConfirmModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmModal({
  open,
  title,
  description,
  busy = false,
  error = null,
  confirmLabel = "Endgültig löschen",
  busyLabel = "Löschen...",
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  if (!open) return null;

  const canConfirm = confirmText === CONFIRM_WORD && !busy;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[110] p-4"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div className="bg-[#0d1526] border border-red-900/50 rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e2d4a]">
          <h2 className="text-sm font-semibold text-red-300 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> {title}
          </h2>
          <button onClick={onCancel} disabled={busy} className="text-gray-400 hover:text-white disabled:opacity-50"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-300 leading-relaxed">{description}</p>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              Zum Bestätigen <span className="text-red-300 font-semibold">{CONFIRM_WORD}</span> eingeben:
            </label>
            <input
              autoFocus
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="w-full bg-[#0a0f1a] border border-[#1e2d4a] text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-red-500/50"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 bg-red-950/50 border border-red-800/60 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-200 leading-relaxed">{error}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={busy}
              className="text-xs px-4 py-2 rounded border border-[#1e2d4a] text-gray-300 hover:bg-[#1e2d4a]/40 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              onClick={onConfirm}
              disabled={!canConfirm}
              className="text-xs px-4 py-2 rounded bg-red-900/80 hover:bg-red-800 text-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
