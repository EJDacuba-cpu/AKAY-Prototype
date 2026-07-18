import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
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
  Volume2,
} from "lucide-react";
import { useNotifications } from "../../hooks/useNotificationsContext";
import NotificationModal from "../../components/features/notifications/NotificationModal";
import { playAkayUrgentAlertSound } from "../../utils/notificationSound";

const FILTERS = [
  { key: "inbox", label: "Inbox", icon: Inbox, empty: "No notifications in your inbox." },
  { key: "unread", label: "Unread", icon: Mail, empty: "No unread notifications." },
  { key: "followups", label: "Follow-ups", icon: Clock, empty: "No follow-up notifications." },
  { key: "referrals", label: "Referrals", icon: Send, empty: "No referral notifications." },
  { key: "medicine", label: "Medicine", icon: Package, empty: "No medicine notifications." },
  { key: "system", label: "System", icon: Settings, empty: "No system notifications." },
  { key: "trash", label: "Trash", icon: Trash2, empty: "Trash is empty." },
];

function normalizeText(value = "") {
  return String(value || "").toLowerCase();
}

function getNotificationCategory(notification = {}) {
  const source = [
    notification.type,
    notification.entityType,
    notification.category,
    notification.title,
    notification.message,
  ]
    .map(normalizeText)
    .join(" ");

  if (
    [
      "follow_up",
      "followup",
      "follow-up",
      "no_show",
      "no show",
      "due_today",
      "due today",
      "rescheduled",
    ].some((keyword) => source.includes(keyword))
  ) {
    return "followups";
  }

  if (
    [
      "referral",
      "incoming_referral",
      "referral_received",
      "referral_completed",
      "referral_no_show",
    ].some((keyword) => source.includes(keyword))
  ) {
    return "referrals";
  }

  if (
    ["medicine", "inventory", "low_stock", "low stock", "expiring", "expired"].some(
      (keyword) => source.includes(keyword),
    )
  ) {
    return "medicine";
  }

  if (
    ["system", "account", "user", "role"].some((keyword) =>
      source.includes(keyword),
    )
  ) {
    return "system";
  }

  return "system";
}

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

function getNotificationSearchText(notification = {}) {
  return [
    notification.title,
    notification.message,
    notification.description,
    notification.type,
    getCategoryLabel(getNotificationCategory(notification)),
    getNotificationEntity(notification),
  ]
    .map(normalizeText)
    .join(" ");
}

export default function NotificationsPage() {
  const {
    notifications,
    notificationsError,
    notificationsLoading,
    notificationSoundEnabled,
    markAsRead,
    markSelectedAsRead,
    markSelectedAsUnread,
    markAllAsRead,
    setNotificationSoundEnabled,
    moveNotificationsToTrash,
    restoreNotificationsFromTrash,
    refreshNotifications,
  } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("inbox");
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const activeNotifications = useMemo(
    () => notifications.filter((notification) => !notification.isTrashed),
    [notifications],
  );
  const trashNotifications = useMemo(
    () => notifications.filter((notification) => notification.isTrashed),
    [notifications],
  );
  const counts = useMemo(
    () => ({
      inbox: activeNotifications.length,
      unread: activeNotifications.filter((notification) => !notification.isRead)
        .length,
      followups: activeNotifications.filter(
        (notification) => getNotificationCategory(notification) === "followups",
      ).length,
      referrals: activeNotifications.filter(
        (notification) => getNotificationCategory(notification) === "referrals",
      ).length,
      medicine: activeNotifications.filter(
        (notification) => getNotificationCategory(notification) === "medicine",
      ).length,
      system: activeNotifications.filter(
        (notification) => getNotificationCategory(notification) === "system",
      ).length,
      trash: trashNotifications.length,
    }),
    [activeNotifications, trashNotifications],
  );

  const filteredNotifications = useMemo(() => {
    const source =
      activeFilter === "trash" ? trashNotifications : activeNotifications;
    const byFilter = source.filter((notification) => {
      if (activeFilter === "inbox" || activeFilter === "trash") return true;
      if (activeFilter === "unread") return !notification.isRead;
      return getNotificationCategory(notification) === activeFilter;
    });
    const query = searchTerm.trim().toLowerCase();
    if (!query) return byFilter;
    return byFilter.filter((notification) =>
      getNotificationSearchText(notification).includes(query),
    );
  }, [activeFilter, activeNotifications, searchTerm, trashNotifications]);

  const visibleIds = useMemo(
    () => filteredNotifications.map((notification) => String(notification.id)),
    [filteredNotifications],
  );
  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const currentFilter = FILTERS.find((filter) => filter.key === activeFilter);
  const showInitialLoading =
    notificationsLoading && notifications.length === 0 && !notificationsError;
  const showRefreshing =
    notificationsLoading && notifications.length > 0 && !notificationsError;

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
    void refreshNotifications({ force: true, maxAgeMs: 0 });
  }

  async function handleNotificationSoundToggle() {
    resetFeedback();
    setActionLoading(true);
    const nextEnabled = !notificationSoundEnabled;

    try {
      const unlocked = await setNotificationSoundEnabled(nextEnabled);
      if (nextEnabled && !unlocked) {
        setActionError(
          "Urgent alert sound is on, but your browser may need another page interaction before audio can play.",
        );
        return;
      }
      setActionMessage(
        nextEnabled
          ? "Urgent alert sound is on for new urgent notifications."
          : "Urgent alert sound is off.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTestNotificationSound() {
    resetFeedback();
    setActionLoading(true);

    try {
      const played = await playAkayUrgentAlertSound({ ignoreCooldown: true });
      if (!played) {
        setActionError(
          "Unable to play the urgent alert sound. Please check the audio file or browser audio permissions.",
        );
        return;
      }
      setActionMessage("Urgent alert sound test played.");
    } finally {
      setActionLoading(false);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 px-1 py-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-base font-bold text-[#0F172A]">
            Notification Inbox
          </h1>
          <p className="mt-0.5 text-xs text-[#64748B]">
            Manage clinical reminders, referrals, inventory alerts, and system
            updates.
          </p>
        </div>
        {showRefreshing && (
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
            <LoaderCircle size={13} className="animate-spin" />
            Updating notifications...
          </div>
        )}
      </div>

      {(actionMessage || actionError) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            actionError
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}
        >
          {actionError || actionMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
            {FILTERS.map((filter) => {
              const Icon = filter.icon;
              const active = activeFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => handleFilterChange(filter.key)}
                  className={`flex min-w-max items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition lg:w-full ${
                    active
                      ? "bg-red-50 font-bold text-[#B91C1C]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} />
                    {filter.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      active ? "bg-white text-[#B91C1C]" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {counts[filter.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#B91C1C] shadow-sm">
                  <Volume2 size={14} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#0F172A]">
                    Urgent Alert Sound
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Play a soft sound for follow-ups, no-shows, referrals, and
                    critical medicine alerts.
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationSoundEnabled}
                onClick={handleNotificationSoundToggle}
                disabled={actionLoading}
                className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  notificationSoundEnabled ? "bg-[#B91C1C]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${
                    notificationSoundEnabled ? "left-5" : "left-0.5"
                  }`}
                />
                <span className="sr-only">
                  {notificationSoundEnabled
                    ? "Turn urgent alert sound off"
                    : "Turn urgent alert sound on"}
                </span>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold text-slate-500">
                {notificationSoundEnabled ? "On" : "Off"}
              </p>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={handleTestNotificationSound}
                  disabled={actionLoading}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Test Sound
                </button>
              )}
            </div>
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  disabled={visibleIds.length === 0 || actionLoading}
                  className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-slate-300 bg-white">
                    {allVisibleSelected && <Check size={12} strokeWidth={3} />}
                  </span>
                  Select
                </button>

                {selectedCount > 0 ? (
                  <>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#0F172A]">
                      {selectedCount} selected
                    </span>
                    {activeFilter === "trash" ? (
                      <button
                        type="button"
                        onClick={handleRestoreSelected}
                        disabled={actionLoading}
                        className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleMarkSelectedRead}
                          disabled={actionLoading}
                          className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCheck size={14} />
                          Mark as read
                        </button>
                        <button
                          type="button"
                          onClick={handleMarkSelectedUnread}
                          disabled={actionLoading}
                          className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Mail size={14} />
                          Mark as unread
                        </button>
                        <button
                          type="button"
                          onClick={handleMoveSelectedToTrash}
                          disabled={actionLoading}
                          className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          Move to Trash
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={notificationsLoading}
                      className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {notificationsLoading ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Refresh
                    </button>
                    {activeFilter !== "trash" && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={counts.unread === 0 || actionLoading}
                        className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCheck size={14} />
                        Mark all as read
                      </button>
                    )}
                  </>
                )}
              </div>

              <label className="relative block w-full xl:w-72">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search notifications..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-[#0F172A] outline-none transition focus:border-[#B91C1C] focus:bg-white focus:ring-2 focus:ring-[#B91C1C]/10"
                />
              </label>
            </div>
          </div>

          {showInitialLoading ? (
            <NotificationInboxSkeleton />
          ) : notificationsError ? (
            <NotificationErrorState onRetry={handleRefresh} loading={notificationsLoading} />
          ) : filteredNotifications.length === 0 ? (
            <NotificationEmptyState
              title={currentFilter?.empty || "No notifications."}
              searchTerm={searchTerm}
            />
          ) : (
            <div className="divide-y divide-slate-100">
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
          )}
        </section>
      </div>

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

function NotificationErrorState({ onRetry, loading }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-[#B91C1C]">
        <AlertCircle size={21} />
      </div>
      <h3 className="text-sm font-bold text-[#0F172A]">
        Unable to load notifications.
      </h3>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
        Please check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={loading}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-100 hover:bg-red-50 hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        Retry
      </button>
    </div>
  );
}

function NotificationInboxSkeleton() {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[36px_1fr_auto] gap-3 px-4 py-4">
          <div className="h-4 w-4 rounded border border-slate-200 bg-slate-100" />
          <div className="space-y-2">
            <div className="h-3 w-44 rounded bg-slate-100" />
            <div className="h-3 w-full max-w-md rounded bg-slate-100" />
          </div>
          <div className="h-3 w-16 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
