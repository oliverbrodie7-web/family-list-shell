import { useState } from "react";
import { X } from "lucide-react";

export function BulkAddSheet({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (items: string[]) => void;
}) {
  const [text, setText] = useState("");

  const parse = (s: string): string[] =>
    s
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

  const items = parse(text);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 active:bg-neutral-100"
        >
          <X size={20} />
        </button>
        <h2 className="text-[17px] font-semibold text-neutral-900">Bulk add</h2>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 pb-32">
        <p className="mb-2 text-[13px] text-neutral-500">
          One item per line, or separated by commas.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"milk\neggs\nbananas\nbread"}
          className="h-[55vh] w-full resize-none rounded-xl border border-neutral-200 px-3 py-3 text-[16px] leading-relaxed text-neutral-900 outline-none focus:border-[var(--accent-green)]"
        />
        <p className="mt-2 text-[13px] text-neutral-400">
          {items.length} {items.length === 1 ? "item" : "items"} detected
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-100 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <button
          type="button"
          onClick={() => onSubmit(items)}
          disabled={items.length === 0}
          className="w-full rounded-xl bg-[var(--accent-green)] py-4 text-[15px] font-semibold text-white transition active:opacity-90 disabled:opacity-40"
        >
          Review {items.length > 0 ? `(${items.length})` : ""}
        </button>
      </div>
    </div>
  );
}
