import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";

import { buildAttentionItems } from "../../../utils/adminDashboard";

const VISIBLE_NAMES = 5;

export default function AttentionStrip({ attention }) {
  const items = buildAttentionItems(attention);

  if (items.length === 0) {
    return (
      <section
        aria-label="Needs attention"
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700"
      >
        <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
        <p>✓ All caught up — no pending account tasks.</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Needs attention"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
        Needs attention
      </p>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <AttentionItem key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

function AttentionItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  const names = item.names || [];
  const hasNames = names.length > 0;
  const listId = `attention-${item.key}-names`;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <AlertTriangle size={15} className="shrink-0 text-amber-600" aria-hidden="true" />
        <Link
          to={item.href}
          className="min-w-0 text-sm font-semibold text-[#0F172A] hover:text-[#B91C1C] hover:underline"
        >
          {item.label}
        </Link>

        {hasNames && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="text-xs font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
          >
            {expanded ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {hasNames && expanded && (
        <ul id={listId} className="ml-6 mt-1.5 space-y-0.5 text-xs text-slate-700">
          {names.slice(0, VISIBLE_NAMES).map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
          {names.length > VISIBLE_NAMES && (
            <li className="font-semibold text-amber-700">+{names.length - VISIBLE_NAMES} more</li>
          )}
        </ul>
      )}
    </li>
  );
}
