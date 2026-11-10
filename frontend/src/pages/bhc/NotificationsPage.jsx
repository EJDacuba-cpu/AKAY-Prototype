import { getNotificationCategory } from "../../utils/notificationCategory";
import { errorStateVariant } from "../../utils/errorStateVariant";
import { useEffect, useMemo, useState } from "react";
import { ConnectionErrorState, PageSkeletonLoader } from "../../components/common";
import { useNavigate } from "react-router";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Inbox,
  LoaderCircle,
  Mail,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationModal from "../../components/features/notifications/NotificationModal";

const FILTERS = [
  { key: "inbox", label: "Inbox", icon: Inbox, empty: "No notifications in your inbox." },
  { key: "unread", label: "Unread", icon: Mail, empty: "No unread notifications." },
  { key: "followups", label: "Follow-ups", icon: Clock, empty: "No follow-up notifications." },
  { key: "referrals", label: "Referrals", icon: Send, empty: "No referral notifications." },
  { key: "medicine", label: "Medicine", icon: Package, empty: "No medicine notifications." },
  { key: "system", label: "System", icon: Settings, empty: "No system notifications." },
  { key: "trash", label: "Trash", icon: Trash2, empty: "Trash is empty." },
];

function getCategoryLabel(category) {
  return FILTERS.find((filter) => filter.key === category)?.label || "System";
}

function getNotificationSnippet(notification = {}) {
  return (
    notification.message ||
    notification.description ||
    notification.title ||
    "AKAY notification"
  );
}

function getNotificationEntity(notification = {}) {
  return (
    notification.patientName ||
    notification.patient_name ||
    notification.entityName ||
    notification.entity_name ||
    notification.sender ||
    ""
  );
}

export default function NotificationsPage() {
  const {
    notifications,
    trashedNotifications,
    trashLoading,
    hasLoadedTrash,
    trashError,
    notificationCounts,
    notificationsError,
    notificationsLoading,
    hasLoadedNotifications,
    hasMoreNotifications,
    loadMoreNotifications,
    markAsRead,
    markSelectedAsRead,
    markSelectedAsUnread,
    markAllAsRead,
    moveNotificationsToTrash,
    restoreNotificationsFromTrash,
    refreshNotifications,
    refreshTrash,
  } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("inbox");
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Decision D-4: true, database-backed counts instead of a client useMemo
  // over whatever page happens to be loaded.
  const counts = notificationCounts || {
    inbox: 0,
    unread: 0,
    followups: 0,
    referrals: 0,
    medicine: 0,
    system: 0,
    trash: 0,
  };

  // Decision D-5: Trash is now its own server-backed fetch, not a client
  // filter over the Inbox array (which never contains trashed rows).
  useEffect(() => {
    if (activeFilter === "trash") {
      void refreshTrash({ search: searchTerm }).catch(() => {});
    }
  }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decision D-8: search runs server-side (so it reaches beyond whatever
  // page is currently cached), debounced so it doesn't fire on every
  // keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (activeFilter === "trash") {
        void refreshTrash({ search: searchTerm }).catch(() => {});
      } else {
        void refreshNotifications({ force: true, maxAgeMs: 0, search: searchTerm });
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const filteredNotifications = useMemo(() => {
    const source = activeFilter === "trash" ? trashedNotifications : notifications;
    if (activeFilter === "inbox" || activeFilter === "trash") return source;
    if (activeFilter === "unread") {
      return source.filter((notification) => !notification.isRead);
    }
    return source.filter(
      (notification) => getNotificationCategory(notification) === activeFilter,
    );
  }, [activeFilter, notifications, trashedNotifications]);

  const visibleIds = useMemo(
    () => filteredNotifications.map((notification) => String(notification.id)),
    [filteredNotifications],
  );
  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const currentFilter = FILTERS.find((filter) => filter.key === activeFilter);
  const isViewingTrash = activeFilter === "trash";
  const viewLoading = isViewingTrash ? trashLoading : notificationsLoading;
  const viewError = isViewingTrash ? trashError : notificationsError;
  const hasLoadedView = isViewingTrash ? hasLoadedTrash : hasLoadedNotifications;
  const showInitialLoading = !isViewingTrash && !hasLoadedNotifications && notifications.length === 0 && !notificationsError;
  const showInitialTrashLoading = isViewingTrash && !hasLoadedTrash && trashedNotifications.length === 0 && !trashError;
  const showRefreshing =
    viewLoading && !showInitialLoading && !showInitialTrashLoading && !viewError;

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleIds.includes(id)));
  }, [visibleIds]);

  function resetFeedback() {
    setActionMessage("");
    setActionError("");
  }

  async function runAction(action, successMessage) {
    resetFeedback();
    setActionLoading(true);
    try {
      await action();
      setActionMessage(successMessage);
      setSelectedIds([]);
    } catch (error) {
      setActionError(error?.message || "Unable to update notifications.");
    } finally {
      setActionLoading(false);
    }
  }

  function toggleSelectAllVisible() {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  }

  function toggleNotificationSelection(notificationId) {
    const id = String(notificationId);
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id],
    );
  }

  function handleFilterChange(filterKey) {
    setActiveFilter(filterKey);
    setSelectedIds([]);
    resetFeedback();
  }

  async function handleViewNotification(notification) {
    if (selectedIds.length > 0) {
      toggleNotificationSelection(notification.id);
      return;
    }
    if (!notification.isRead) {
      void markAsRead(notification.id).catch(() => {});
    }
    setSelectedNotif(notification);
  }

  function handleRefresh() {
    if (isViewingTrash) {
      void refreshTrash({ search: searchTerm }).catch(() => {});
      return;
    }
    void refreshNotifications({ force: true, maxAgeMs: 0, search: searchTerm });
  }

  // Decision D-2: the escape hatch for D-1's 50-row cap - nothing becomes
  // permanently invisible, it just takes one more click to reach.
  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      await loadMoreNotifications();
    } finally {
      setLoadingMore(false);
    }
  }

  function handleMoveSelectedToTrash() {
    if (selectedCount === 0) return;
    const count = selectedCount;
    runAction(async () => {
      moveNotificationsToTrash(selectedIds);
    }, `${count} notification${count !== 1 ? "s" : ""} moved to Trash.`);
  }

  function handleRestoreSelected() {
    if (selectedCount === 0) return;
    const count = selectedCount;
    runAction(async () => {
      restoreNotificationsFromTrash(selectedIds);
    }, `${count} notification${count !== 1 ? "s" : ""} restored.`);
  }

  function handleMarkSelectedRead() {
    if (selectedCount === 0) return;
    const count = selectedCount;
    runAction(
      () => markSelectedAsRead(selectedIds),
      `${count} notification${count !== 1 ? "s" : ""} marked as read.`,
    );
  }

  function handleMarkSelectedUnread() {
    if (selectedCount === 0) return;
    const count = selectedCount;
    runAction(async () => {
      markSelectedAsUnread(selectedIds);
    }, `${count} notification${count !== 1 ? "s" : ""} marked as unread.`);
  }

  function handleMarkAllRead() {
    runAction(markAllAsRead, "All notifications were marked as read.");
  }

  function handleMoveSingleToTrash(notificationId) {
    runAction(async () => {
      moveNotificationsToTrash([notificationId]);
      setSelectedNotif(null);
    }, "Notification moved to Trash.");
  }

  const feedbackBanner = () =>
    actionMessage || actionError ? (
      <div
        className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          actionError
            ? "border-red-100 bg-red-50 text-red-700"
            : "border-emerald-100 bg-emerald-50 text-emerald-700"
        }`}
      >
        {actionError || actionMessage}
      </div>
    ) : null;

  const toolbar = () => (
    <div className="border-b border-neutral-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-nowrap items-center gap-1.5">
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            disabled={visibleIds.length === 0 || actionLoading}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-neutral-300 hover:bg-neutral-50 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-neutral-300 bg-white">
              {allVisibleSelected && <Check size={10} strokeWidth={3} />}
            </span>
            Select
          </button>
          {selectedCount > 0 ? (
            <>
              <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-800">
                {selectedCount}
              </span>
              {activeFilter === "trash" ? (
                <button
                  type="button"
                  onClick={handleRestoreSelected}
                  disabled={actionLoading}
                  title="Restore"
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-60"
                >
                  <RotateCcw size={13} />
                  Restore
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleMarkSelectedRead}
                    disabled={actionLoading}
                    title="Mark as read"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <CheckCheck size={13} />
                    Read
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkSelectedUnread}
                    disabled={actionLoading}
                    title="Mark as unread"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <Mail size={13} />
                    Unread
                  </button>
                  <button
                    type="button"
                    onClick={handleMoveSelectedToTrash}
                    disabled={actionLoading}
                    title="Move to Trash"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-danger shadow-xs transition hover:border-danger/30 hover:bg-danger-soft disabled:pointer-events-none disabled:opacity-60"
                  >
                    <Trash2 size={13} />
                    Trash
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={viewLoading}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-60"
              >
                {viewLoading ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Refresh
              </button>
              {activeFilter !== "trash" && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={counts.unread === 0 || actionLoading}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-50"
                >
                  <CheckCheck size={13} />
                  Mark all
                </button>
              )}
            </>
          )}
        </div>

        <label className="relative block w-full xl:w-72">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
            className="h-9 w-full rounded-full border border-neutral-200 bg-white pl-9 pr-3 text-[13px] text-ink-800 shadow-xs outline-none transition hover:border-neutral-300 focus:border-ink-400 focus:ring-2 focus:ring-ink-400/30"
          />
        </label>
      </div>
    </div>
  );

  const listBody = () =>
    showInitialTrashLoading ? (
      <PageSkeletonLoader skeleton="notifications" bodyOnly message="Loading trash..." />
    ) : filteredNotifications.length === 0 ? (
      <NotificationEmptyState
        title={currentFilter?.empty || "No notifications."}
        searchTerm={searchTerm}
      />
    ) : (
      <>
        <div className="divide-y divide-neutral-100">
          {filteredNotifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              selected={selectedIds.includes(String(notification.id))}
              onToggleSelect={() => toggleNotificationSelection(notification.id)}
              onOpen={() => handleViewNotification(notification)}
            />
          ))}
        </div>
        {!isViewingTrash && hasMoreNotifications && (
          <div className="flex justify-center border-t border-neutral-100 px-4 py-3">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 text-xs font-medium text-neutral-700 shadow-xs transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:pointer-events-none disabled:opacity-60"
            >
              {loadingMore && <LoaderCircle size={14} className="animate-spin" />}
              Show more
            </button>
          </div>
        )}
      </>
    );

  const modal = () => (
    <NotificationModal
      isOpen={!!selectedNotif}
      onClose={() => setSelectedNotif(null)}
      notification={selectedNotif}
      onViewRecord={(notification) => {
        if (notification?.link) {
          setSelectedNotif(null);
          navigate(notification.link);
        }
      }}
      onDelete={(id) => handleMoveSingleToTrash(id)}
      deleteLabel="Move to Trash"
    />
  );

  const filterButtons = FILTERS.map((filter) => {
    const Icon = filter.icon;
    const active = activeFilter === filter.key;
    return (
      <button
        key={filter.key}
        type="button"
        onClick={() => handleFilterChange(filter.key)}
        className={`flex min-w-max items-center justify-between gap-3 rounded-full px-3 py-2 text-left text-[13px] font-medium transition lg:w-full ${
          active
            ? "bg-brand-50 font-semibold text-brand-800"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-ink-800"
        }`}
      >
        <span className="flex items-center gap-2">
          <Icon size={15} />
          {filter.label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
            active ? "bg-white text-brand-800" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {counts[filter.key] || 0}
        </span>
      </button>
    );
  });

  const deniedError = [notificationsError, trashError].find(error => [401, 403].includes(Number(error?.status)));
  if (deniedError) return <ConnectionErrorState fullPage variant={errorStateVariant(deniedError)} onRetry={() => {
    if (deniedError === trashError) void refreshTrash({ search: searchTerm }).catch(() => {});
    else void refreshNotifications({ force: true, maxAgeMs: 0, search: searchTerm });
  }} retrying={deniedError === trashError ? trashLoading : notificationsLoading} />;
  if (showInitialLoading) return <PageSkeletonLoader skeleton="notifications" message="Loading notifications..." />;
  if (viewError && !hasLoadedView) {
    return (
      <ConnectionErrorState
        fullPage
        variant={errorStateVariant(viewError)}
        onRetry={handleRefresh}
        retrying={viewLoading}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <h1 className="text-[17px] font-bold tracking-tight text-ink-800">
            Notification Inbox
          </h1>
          <p className="mt-1 text-[13px] text-neutral-600">
            Clinical reminders, referrals, and inventory alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showRefreshing && (
            <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500">
              <LoaderCircle size={13} className="animate-spin" />
              Updating…
            </span>
          )}
          <p className="text-right text-[13px] font-semibold tabular-nums text-ink-800">
            {counts.unread || 0} unread
          </p>
        </div>
      </header>
      {feedbackBanner()}
      <div className="grid h-[min(32rem,calc(100dvh-12rem))] min-h-0 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white p-2 shadow-[var(--shadow-card)]">
          <div className="flex gap-1 overflow-x-auto lg:block lg:flex-1 lg:space-y-1 lg:overflow-y-auto lg:overflow-x-visible">
            {filterButtons}
          </div>
        </aside>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[var(--shadow-card)]">
          <div className="shrink-0">{toolbar()}</div>
          {viewError && hasLoadedView && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 text-sm text-neutral-600">
            <p>{viewError.message || "Notifications could not be refreshed."}</p>
            <button type="button" onClick={handleRefresh} disabled={viewLoading} className="font-semibold text-ink-700 underline underline-offset-2 disabled:opacity-50">Try again</button>
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {listBody()}
          </div>
        </section>
      </div>
      {modal()}
    </div>
  );
}

function NotificationRow({ notification, selected, onToggleSelect, onOpen }) {
  const unread = !notification.isRead;
  const category = getNotificationCategory(notification);
  const categoryLabel = getCategoryLabel(category);
  const entity = getNotificationEntity(notification);
  const Icon = FILTERS.find((filter) => filter.key === category)?.icon || Bell;

  return (
    <div
      className={`group grid grid-cols-[36px_1fr_auto] gap-2 px-3 py-3 transition hover:bg-slate-50 sm:grid-cols-[40px_18px_1fr_auto] sm:px-4 ${
        unread ? "bg-red-50/35" : "bg-white"
      }`}
    >
      <label className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-[#B91C1C]">
        <input
          type="checkbox"
          className="sr-only"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select notification ${notification.title || notification.id}`}
        />
        <span className="flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white">
          {selected && <Check size={12} strokeWidth={3} />}
        </span>
      </label>

      <span className="hidden items-center justify-center sm:flex">
        {unread && <span className="h-2 w-2 rounded-full bg-[#B91C1C]" />}
      </span>

      <button type="button" onClick={onOpen} className="min-w-0 text-left">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Icon size={11} />
            {categoryLabel}
          </span>
          <h2
            className={`min-w-0 truncate text-sm ${
              unread ? "font-bold text-[#0F172A]" : "font-semibold text-slate-600"
            }`}
          >
            {notification.title || "AKAY Notification"}
          </h2>
        </div>
        <p className="mt-1 truncate text-sm text-slate-500">
          {getNotificationSnippet(notification)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {[entity, categoryLabel].filter(Boolean).join(" - ")}
        </p>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="whitespace-nowrap pt-1 text-right text-[11px] font-medium text-slate-400 transition group-hover:text-[#0F172A]"
      >
        {notification.timestamp || ""}
      </button>
    </div>
  );
}

function NotificationEmptyState({ title, searchTerm }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <Inbox size={32} className="mb-3 text-slate-200" />
      <h3 className="text-sm font-semibold text-slate-400">
        {searchTerm ? "No matching notifications." : title}
      </h3>
    </div>
  );
}
