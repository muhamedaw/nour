"use client";

import { useState } from "react";

/**
 * Optional list of player name chips, rendered below the customer-label
 * field in `SessionHeader`. Purely informational — drives the
 * assign-to-player flow (highlightFlag products) and the split-by-N
 * validation at close. Kept in a separate component so the same control
 * can be reused if a future "people picker" needs to surface elsewhere.
 *
 * Behaviour:
 *   • Add a chip via Enter or the "+" button; empty strings rejected
 *     silently (no toast wall when staff taps the empty input).
 *   • Tap the small × on a chip to remove. No confirm — chips are cheap.
 *   • When busy, all controls are disabled so the parent's debounced
 *     600 ms PATCH can't be interrupted by a click on an in-flight save.
 */
export interface PlayersInputProps {
  players: string[];
  onChange: (next: string[]) => void;
  busy?: boolean;
  /** Cap to keep the layout sane. Defaults to 16 — a 6-max snooker table
   *  doesn't need more, and a larger pool is rare in this business. */
  max?: number;
}

export default function PlayersInput({
  players,
  onChange,
  busy = false,
  max = 16,
}: PlayersInputProps) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (players.includes(clean)) {
      // de-dup visually rather than rejecting — keeps the typing flow fast
      setDraft("");
      return;
    }
    if (players.length >= max) {
      setDraft("");
      return;
    }
    onChange([...players, clean]);
    setDraft("");
  };

  const removeAt = (i: number) => {
    onChange(players.filter((_, idx) => idx !== i));
  };

  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      <span className="text-xs uppercase tracking-widest text-espresso-300">
        اللاعبون (اختياري)
      </span>

      {players.length > 0 && (
        <ul
          className="flex flex-wrap gap-2"
          dir="rtl"
          aria-label="قائمة اللاعبين"
        >
          {players.map((p, i) => (
            <li
              key={`${p}-${i}`}
              className="inline-flex items-center gap-1.5 bg-espresso-800 border border-espresso-700 rounded-full pl-3 pr-1 py-1 text-sm text-espresso-50"
            >
              <span className="truncate max-w-[12ch]">{p}</span>
              <button
                type="button"
                aria-label={`حذف ${p}`}
                onClick={() => removeAt(i)}
                disabled={busy}
                className="min-w-[28px] min-h-[28px] w-7 h-7 rounded-full bg-espresso-700 hover:bg-rust-600 disabled:opacity-50 flex items-center justify-center text-espresso-200 hover:text-espresso-50 text-base font-bold leading-none transition-colors duration-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addDraft();
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="اسم لاعب…"
          maxLength={32}
          disabled={busy || players.length >= max}
          className="flex-1 bg-espresso-900 border border-espresso-700 rounded-2xl px-4 py-3 text-lg transition-colors duration-200 focus:border-copper-500 focus:outline-none disabled:opacity-50"
          aria-label="إضافة لاعب"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim() || players.length >= max}
          className="min-h-[48px] px-5 rounded-2xl bg-copper-600 disabled:opacity-50 hover:bg-copper-500 text-espresso-50 font-bold transition-colors duration-200"
        >
          +
        </button>
      </form>
    </div>
  );
}
