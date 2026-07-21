export const SENSITIVE_SESSION_CLEARED_EVENT =
  "akay:sensitive-session-cleared";

const SESSION_CHANNEL_NAME = "akay-session";
const SESSION_CLEARED_MESSAGE = "SESSION_CLEARED";
const SESSION_EVENT_STORAGE_KEY = "akay_session_event";

export const LEGACY_SENSITIVE_STORAGE_KEYS = [
  "akay_auth_token",
  "akay_auth_user",
  "akay_offline_drafts",
  "akay_health_record_drafts",
  "akay_referral_drafts",
  "akay_patient_drafts",
  "akay_patient_registration_drafts",
  "akay_pending_referral",
  "akay_pending_referral_payload",
  "akay_notification_cache",
  "akay_notifications_cache",
  "akay_notification_trash",
  "akay_qr_token",
  "akay_referral_qr_token",
  "akay_retry_payload",
  "akay_pending_retry",
  "akay_query_cache",
  "akay_query_persist",
  "REACT_QUERY_OFFLINE_CACHE",
];

const LEGACY_SENSITIVE_KEY_PATTERNS = [
  /^akay_(?:health_record|referral|patient(?:_registration)?)_draft/i,
  /^akay_.*(?:pending_(?:referral|retry)|retry_payload|qr_token)$/i,
  /^akay_.*(?:notification|query)_cache$/i,
];

const SENSITIVE_CACHE_NAME_PATTERN =
  /akay.*(?:api|clinical|patient|health|referral|notification|query)/i;
const SENSITIVE_API_PATH_PATTERN =
  /\/api\/(?:patients|health-records|referrals|feedback|follow-up-tasks|medicines|reports|notifications)(?:\/|\?|$)/i;

function removeKnownKeys(storage) {
  if (!storage) return [];

  const removed = new Set();
  LEGACY_SENSITIVE_STORAGE_KEYS.forEach((key) => {
    if (storage.getItem(key) !== null) {
      storage.removeItem(key);
      removed.add(key);
    }
  });

  const existingKeys = Array.from(
    { length: storage.length },
    (_, index) => storage.key(index),
  ).filter(Boolean);

  existingKeys.forEach((key) => {
    if (LEGACY_SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      storage.removeItem(key);
      removed.add(key);
    }
  });

  return [...removed];
}

async function clearSensitiveCacheStorage() {
  if (typeof window === "undefined" || !("caches" in window)) return [];

  const removed = [];
  const cacheNames = await window.caches.keys();

  await Promise.all(
    cacheNames.map(async (cacheName) => {
      if (SENSITIVE_CACHE_NAME_PATTERN.test(cacheName)) {
        await window.caches.delete(cacheName);
        removed.push(cacheName);
        return;
      }

      const cache = await window.caches.open(cacheName);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => SENSITIVE_API_PATH_PATTERN.test(request.url))
          .map((request) => cache.delete(request)),
      );
    }),
  );

  return removed;
}

function clearLegacySensitiveHistoryState() {
  const state = window.history?.state;
  if (!state || typeof state !== "object") return false;

  let nextState = state;
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(state, "healthRecordDraft")) {
    const { healthRecordDraft: _removed, ...rest } = state;
    void _removed;
    nextState = rest;
    changed = true;
  }

  if (
    nextState.usr &&
    typeof nextState.usr === "object" &&
    Object.prototype.hasOwnProperty.call(nextState.usr, "healthRecordDraft")
  ) {
    const { healthRecordDraft: _removed, ...safeUserState } = nextState.usr;
    void _removed;
    nextState = { ...nextState, usr: safeUserState };
    changed = true;
  }

  if (changed) {
    window.history.replaceState(nextState, document.title, window.location.href);
  }

  return changed;
}

export function clearLegacySensitiveBrowserData() {
  if (typeof window === "undefined") {
    return Promise.resolve({
      localStorage: [],
      sessionStorage: [],
      caches: [],
      historyState: false,
    });
  }

  let localStorageKeys = [];
  let sessionStorageKeys = [];
  let historyState = false;
  try {
    localStorageKeys = removeKnownKeys(window.localStorage);
  } catch {
    localStorageKeys = [];
  }
  try {
    sessionStorageKeys = removeKnownKeys(window.sessionStorage);
  } catch {
    sessionStorageKeys = [];
  }
  try {
    historyState = clearLegacySensitiveHistoryState();
  } catch {
    historyState = false;
  }

  return clearSensitiveCacheStorage()
    .catch(() => [])
    .then((cacheNames) => ({
      localStorage: localStorageKeys,
      sessionStorage: sessionStorageKeys,
      caches: cacheNames,
      historyState,
    }));
}

export function getSessionIdentity(user = {}) {
  return {
    userId: String(user.id || ""),
    role: String(user.backendRole || user.role || ""),
    facilityId: String(
      user.barangayHealthCenterId ||
        user.ruralHealthUnitId ||
        user.facilityId ||
        user.barangay_health_center_id ||
        user.rural_health_unit_id ||
        "",
    ),
    status: String(user.status || "").toLowerCase(),
  };
}

export function isSameSessionIdentity(previousUser, nextUser) {
  const previous = getSessionIdentity(previousUser);
  const next = getSessionIdentity(nextUser);

  return (
    previous.userId === next.userId &&
    previous.role === next.role &&
    previous.facilityId === next.facilityId &&
    previous.status === next.status
  );
}

function broadcastSessionCleared() {
  if (typeof window === "undefined") return;

  const message = {
    type: SESSION_CLEARED_MESSAGE,
    timestamp: Date.now(),
  };

  if (!("BroadcastChannel" in window)) {
    try {
      window.localStorage.setItem(
        SESSION_EVENT_STORAGE_KEY,
        JSON.stringify(message),
      );
      window.localStorage.removeItem(SESSION_EVENT_STORAGE_KEY);
    } catch {
      // The current tab is still cleared when cross-tab signaling is unavailable.
    }
    return;
  }

  const channel = new window.BroadcastChannel(SESSION_CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

export async function clearSensitiveSessionState({
  queryClient,
  reason = "session-cleared",
  broadcast = true,
  preserveAuthentication = false,
} = {}) {
  try {
    await queryClient?.cancelQueries();
  } catch {
    // Cache cleanup must continue even if a request cannot be cancelled.
  }

  queryClient?.getMutationCache?.().clear();
  queryClient?.getQueryCache?.().clear();
  queryClient?.clear?.();

  await clearLegacySensitiveBrowserData();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SENSITIVE_SESSION_CLEARED_EVENT, {
        detail: { reason, preserveAuthentication },
      }),
    );
  }

  if (broadcast) broadcastSessionCleared();
}

export function subscribeToCrossTabSessionClear(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (!("BroadcastChannel" in window)) {
    const handleStorage = (event) => {
      if (event.key !== SESSION_EVENT_STORAGE_KEY || !event.newValue) return;
      try {
        const message = JSON.parse(event.newValue);
        if (message?.type === SESSION_CLEARED_MESSAGE) callback();
      } catch {
        // Ignore malformed session events from unrelated scripts.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }

  const channel = new window.BroadcastChannel(SESSION_CHANNEL_NAME);
  channel.addEventListener("message", (event) => {
    if (event.data?.type === SESSION_CLEARED_MESSAGE) callback();
  });

  return () => channel.close();
}

export function isForcedSessionInvalidation(status, payload = {}) {
  if (Number(status) === 401) return true;
  if (Number(status) !== 403) return false;

  const code = String(payload?.code || "").toUpperCase();
  if (["ACCOUNT_INACTIVE", "SESSION_CONTEXT_INVALID"].includes(code)) {
    return true;
  }

  const message = String(payload?.message || "").toLowerCase();
  return (
    message.includes("account is inactive") ||
    message.includes("valid active facility assignment is required")
  );
}
