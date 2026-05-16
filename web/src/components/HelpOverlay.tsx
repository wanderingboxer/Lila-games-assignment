"use client";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<[string, string]> = [
  ["Space  /  K", "Play / pause the timeline"],
  ["← / →", "Step −/+ 50 ms (hold Shift for 250 ms)"],
  ["[  /  ]", "Jump to previous / next discrete event"],
  ["R  /  Home", "Restart playback"],
  ["End", "Jump to end of match"],
  ["H", "Cycle heatmap mode"],
  ["M", "Cycle to next map"],
  ["P", "Toggle POI labels"],
  ["C", "Toggle storm corridor"],
  ["S", "Snapshot current view as PNG"],
  ["?", "Show / hide this help"],
];

export function HelpOverlay({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-ink-700 bg-ink-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded bg-ink-700 px-2 py-1 text-xs text-zinc-300 hover:bg-ink-600"
          >
            esc
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-3 rounded bg-ink-800 px-3 py-1.5">
              <kbd className="rounded border border-ink-600 bg-ink-700 px-2 py-0.5 font-mono text-xs text-zinc-200">
                {k}
              </kbd>
              <span className="text-zinc-300">{label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded bg-ink-800 p-3 text-[11px] leading-relaxed text-zinc-400">
          The URL is kept in sync with every selection — copy the address bar to
          share the exact view (map, match, heatmap, even playhead position).
        </div>
      </div>
    </div>
  );
}
