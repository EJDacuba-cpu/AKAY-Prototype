import { apiRequest, unwrapData, unwrapList } from "./apiClient";

const VOLUME_CACHE_MS = 60_000;
let volumeCache = {
  status: "Normal",
  updatedAt: "",
  counts: {
    referralsToday: 0,
    activeMonitoringRecords: 0,
    monitoringReferrals: 0,
    walkInPatientsToday: 0,
    highPriorityReferralsToday: 0,
  },
};
let loadingPromise = null;
let lastFetchedAt = 0;

function normalizeStatus(value) {
  const raw = String(value || "Normal").trim().toLowerCase();
  if (raw === "low") return "Low";
  if (raw === "high") return "High";
  return "Normal";
}

async function refreshVolume({ force = false } = {}) {
  const now = Date.now();

  if (loadingPromise) return loadingPromise;
  if (!force && lastFetchedAt && now - lastFetchedAt < VOLUME_CACHE_MS) {
    return volumeCache;
  }

  loadingPromise = apiRequest("/rhu-patient-volumes")
    .then((response) => {
      const first = unwrapList(response)[0] || {};
      volumeCache = {
        ...volumeCache,
        status: normalizeStatus(first.status),
        updatedAt: first.updated_at || first.updatedAt || "",
      };
      lastFetchedAt = Date.now();
      return volumeCache;
    })
    .catch(() => volumeCache)
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export function getRhuPatientVolume(defaultVolume = "Normal") {
  refreshVolume();
  return volumeCache.status || defaultVolume;
}

export function getRhuPatientVolumeUpdatedTime(defaultValue = "Not updated yet") {
  refreshVolume();
  return volumeCache.updatedAt || defaultValue;
}

export async function saveRhuPatientVolume(volume) {
  const response = await apiRequest("/rhu-patient-volumes", {
    method: "POST",
    body: { status: normalizeStatus(volume) },
  });
  const data = unwrapData(response);
  volumeCache = {
    ...volumeCache,
    status: normalizeStatus(data.status),
    updatedAt: data.updated_at || new Date().toISOString(),
  };
  lastFetchedAt = Date.now();
  return volumeCache;
}

export function calculateRhuVolume(counts = {}) {
  const score =
    Number(counts.referralsToday || 0) * 2 +
    Number(counts.activeMonitoringRecords || 0) +
    Number(counts.monitoringReferrals || 0) +
    Number(counts.walkInPatientsToday || 0) +
    Number(counts.highPriorityReferralsToday || 0) * 3;

  if (score >= 12) return "High";
  if (score <= 3) return "Low";
  return "Normal";
}

export function getRhuWorkloadCounts() {
  return volumeCache.counts;
}

export function getRhuVolumeSnapshot() {
  refreshVolume();
  return {
    volume: volumeCache.status,
    status: volumeCache.status,
    updatedAt: volumeCache.updatedAt,
    counts: volumeCache.counts,
  };
}
