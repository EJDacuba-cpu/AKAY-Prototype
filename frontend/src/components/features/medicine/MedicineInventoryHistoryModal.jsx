import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  History,
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  X,
} from "lucide-react";
import { getMedicineTransactions } from "../../../services/medicineService";
import { queryKeys } from "../../../utils/queryKeys";

const TRANSACTIONS_PER_PAGE = 15;

const TRANSACTION_LABELS = {
  opening_balance: "Opening Balance",
  restock: "Restock",
  dispense: "Dispensed",
  adjustment_in: "Stock Added",
  adjustment_out: "Stock Removed",
  damaged_disposal: "Damaged Stock Disposal",
  expired_disposal: "Expired Stock Disposal",
  correction: "Inventory Correction",
};

const SOURCE_LABELS = {
  health_record: "Health Record",
  manual_restock: "Manual Restock",
  manual_adjustment: "Manual Adjustment",
  disposal: "Disposal",
  opening_balance: "Opening Balance",
  correction: "Correction",
};

export default function MedicineInventoryHistoryModal({
  open,
  item,
  user,
  onClose,
}) {
  const [page, setPage] = useState(1);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const itemId = item?.id || "";

  useEffect(() => {
    if (!open) {
      setPage(1);
      return;
    }
    setPage(1);
  }, [open, itemId]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  const historyQuery = useQuery({
    queryKey: queryKeys.medicineTransactions(user, itemId, page),
    queryFn: () =>
      getMedicineTransactions(itemId, {
        page,
        perPage: TRANSACTIONS_PER_PAGE,
      }),
    enabled: Boolean(open && itemId),
    retry: false,
  });

  const paginator = historyQuery.data?.data || {};
  const transactions = useMemo(
    () => (Array.isArray(paginator.data) ? paginator.data : []),
    [paginator.data],
  );
  const currentPage = Number(paginator.current_page) || page;
  const totalPages = Math.max(Number(paginator.last_page) || 1, 1);
  const facilityName = String(user?.facility || "").trim();

  if (!open || !item) return null;

  function changePage(nextPage) {
    if (historyQuery.isFetching) return;
    setPage(Math.min(Math.max(nextPage, 1), totalPages));
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
        aria-label="Close inventory history"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="medicine-inventory-history-title"
        className="relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xl shadow-slate-950/15 sm:max-h-[calc(100vh-2.5rem)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
              <History size={19} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="medicine-inventory-history-title"
                className="truncate text-base font-bold text-[#0F172A]"
              >
                Inventory History
              </h2>
              <p className="mt-0.5 truncate text-sm font-semibold text-[#374151]">
                {item.name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#64748B]">
                <span className="rounded-md bg-[#F1F5F9] px-2 py-1">
                  Current stock: {Number(item.quantity || 0).toLocaleString()} {item.unit || ""}
                </span>
                {facilityName && (
                  <span className="rounded-md border border-[#E2E8F0] px-2 py-1">
                    {facilityName}
                  </span>
                )}
                {historyQuery.isFetching && !historyQuery.isLoading && (
                  <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                    <LoaderCircle size={12} className="animate-spin" />
                    Updating history...
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close inventory history"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
          >
            <X size={17} />
          </button>
        </header>

        <div className="min-h-[360px] flex-1 overflow-auto">
          {historyQuery.isLoading ? (
            <HistorySkeleton />
          ) : historyQuery.isError ? (
            <HistoryError
              loading={historyQuery.isFetching}
              onRetry={() => historyQuery.refetch()}
            />
          ) : transactions.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9] text-[#94A3B8]">
                <PackageOpen size={21} />
              </div>
              <p className="mt-4 text-sm font-semibold text-[#0F172A]">
                No inventory history yet.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1020px] text-left">
              <thead className="sticky top-0 z-10 bg-[#F8FAFC]">
                <tr className="border-b border-[#E5E7EB] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="px-5 py-3">Date and Time</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3 text-right">Before</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">After</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Performed By</th>
                  <th className="px-5 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {transactions.map((transaction, index) => (
                  <TransactionRow
                    key={transactionRowKey(transaction, currentPage, index)}
                    transaction={transaction}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!historyQuery.isLoading && !historyQuery.isError && transactions.length > 0 && (
          <footer className="flex flex-col gap-3 border-t border-[#E5E7EB] bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs font-medium text-[#64748B]">
              Page <span className="font-bold text-[#B91C1C]">{currentPage}</span> of{" "}
              <span className="font-bold text-[#0F172A]">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <PageButton
                label="Previous"
                icon={<ChevronLeft size={14} />}
                disabled={currentPage <= 1 || historyQuery.isFetching}
                onClick={() => changePage(currentPage - 1)}
              />
              <PageButton
                label="Next"
                icon={<ChevronRight size={14} />}
                iconAfter
                disabled={currentPage >= totalPages || historyQuery.isFetching}
                onClick={() => changePage(currentPage + 1)}
              />
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

function TransactionRow({ transaction }) {
  const delta = Number(transaction.quantity_delta) || 0;

  return (
    <tr className="align-top transition-colors hover:bg-[#F8FAFC]">
      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[#475569]">
        {formatDateTime(transaction.created_at)}
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className="rounded-md bg-[#F1F5F9] px-2 py-1 text-[11px] font-semibold text-[#334155]">
          {friendlyLabel(transaction.transaction_type, TRANSACTION_LABELS)}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm tabular-nums text-[#475569]">
        {formatQuantity(transaction.quantity_before)}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3.5 text-right text-sm font-bold tabular-nums ${
          delta > 0
            ? "text-emerald-700"
            : delta < 0
              ? "text-[#B91C1C]"
              : "text-[#475569]"
        }`}
      >
        {formatDelta(delta)}
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-[#0F172A]">
        {formatQuantity(transaction.quantity_after)}
      </td>
      <td className="max-w-[260px] px-4 py-3.5 text-xs leading-5 text-[#475569]">
        {formatReason(transaction)}
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-xs font-medium text-[#334155]">
        {transaction.actor?.name || "\u2014"}
      </td>
      <td className="whitespace-nowrap px-5 py-3.5 text-xs text-[#64748B]">
        {friendlyLabel(transaction.source_type, SOURCE_LABELS)}
      </td>
    </tr>
  );
}

function HistorySkeleton() {
  return (
    <div className="animate-pulse px-5 py-5 sm:px-6" aria-label="Loading inventory history">
      <div className="h-9 rounded-md bg-[#F1F5F9]" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="h-12 rounded-md bg-[#F8FAFC]" />
        ))}
      </div>
    </div>
  );
}

function HistoryError({ loading, onRetry }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF2F2] text-[#B91C1C]">
        <AlertCircle size={21} />
      </div>
      <p className="mt-4 max-w-sm text-sm font-semibold text-[#0F172A]">
        Inventory history could not be loaded. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={loading}
        aria-busy={loading}
        className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 text-xs font-semibold text-[#475569] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {loading ? "Retrying..." : "Try Again"}
      </button>
    </div>
  );
}

function PageButton({ label, icon, iconAfter = false, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-semibold text-[#475569] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {!iconAfter && icon}
      {label}
      {iconAfter && icon}
    </button>
  );
}

function friendlyLabel(value, labels) {
  if (!value) return "\u2014";
  if (labels[value]) return labels[value];

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function transactionRowKey(transaction, page, index) {
  return [
    page,
    index,
    transaction.created_at,
    transaction.transaction_type,
    transaction.quantity_before,
    transaction.quantity_delta,
    transaction.quantity_after,
  ].join(":");
}

function formatReason(transaction) {
  const reason = String(transaction.reason || "").trim();
  if (reason) return reason;
  if (transaction.transaction_type === "opening_balance") return "Initial stock";
  if (transaction.transaction_type === "dispense") {
    return "Dispensed through health record";
  }
  return "\u2014";
}

function formatQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity.toLocaleString() : "\u2014";
}

function formatDelta(value) {
  if (value > 0) return `+${value.toLocaleString()}`;
  return value.toLocaleString();
}

function formatDateTime(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
