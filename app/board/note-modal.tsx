"use client";

import { useState } from "react";

// Shared compose modal for freeform notes (equipment + by-patient
// sub-tabs) — replaces window.prompt() with an actual editor.
export function NoteModal({
  title,
  initialNote,
  onSave,
  onCancel,
}: {
  title: string;
  initialNote: string;
  onSave: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(initialNote);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/45 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3.5 text-sm font-semibold text-ink">{title}</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          autoFocus
          className="w-full rounded-md border border-line bg-page px-3 py-2.5 text-sm leading-relaxed text-ink"
        />
        <div className="mt-3.5 flex gap-2">
          <button
            onClick={() => onSave(note.trim())}
            className="flex-1 rounded-md bg-brand px-3 py-2.5 text-center text-xs font-semibold text-white"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-line-strong bg-surface px-4 py-2.5 text-xs text-ink-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
