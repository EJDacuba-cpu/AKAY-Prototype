import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { buildAttentionItems } from "../../../utils/adminDashboard";

const VISIBLE_NAMES = 5;

export default function AttentionStrip({ attention }) {
  const items = buildAttentionItems(attention);

  return (
    <Card className="h-full rounded-card shadow-card" aria-label="Needs attention">
      <CardHeader>
        <CardTitle>Needs Attention</CardTitle>
        <CardDescription>
          Access requests and staff assignment gaps that need MHO action.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
            Nothing needs attention today.
          </p>
        ) : (
          items.map((item) => <AttentionItem key={item.key} item={item} />)
        )}
      </CardContent>
    </Card>
  );
}

function AttentionItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  const names = item.names || [];
  const hasNames = names.length > 0;
  const listId = `attention-${item.key}-names`;

  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2.5 hover:bg-neutral-50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={item.href}
            className="flex items-center gap-2 text-sm font-medium text-neutral-900 hover:text-brand-700 hover:underline"
          >
            <AlertTriangle className="shrink-0 text-brand-700" size={14} aria-hidden="true" />
            <span className="min-w-0">{item.label}</span>
          </Link>

          {hasNames && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              aria-controls={listId}
              className="mt-1 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              {expanded ? "Hide facilities" : "Show facilities"}
            </button>
          )}
        </div>
        <span className="text-sm font-semibold tabular-nums text-neutral-900">{item.count}</span>
      </div>

      {hasNames && expanded && (
        <ul id={listId} className="mt-2 space-y-0.5 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
          {names.slice(0, VISIBLE_NAMES).map((name, index) => (
            <li key={`${name}-${index}`}>{name}</li>
          ))}
          {names.length > VISIBLE_NAMES && (
            <li className="font-semibold text-amber-700">+{names.length - VISIBLE_NAMES} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
