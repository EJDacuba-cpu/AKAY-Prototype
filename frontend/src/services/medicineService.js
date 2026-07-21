import { apiRequest, unwrapData, unwrapList } from "./apiClient";

export const MEDICINE_CATEGORIES = [
  "Basic Medicines",
  "Vaccines",
  "Medical Supplies",
  "Maternal Care Supplies",
  "Child Health Supplies",
  "Referral-related Resources",
];

export const MEDICINE_UNITS = ["pcs", "boxes", "bottles", "vials", "packs", "tablets", "capsules"];

const RHU_UPDATE_EVENT = "akay_rhu_medicines_updated";
const BHC_UPDATE_EVENT = "akay_bhc_medicines_updated";

let medicineCache = [];
let loadingPromise = null;

function emit(eventName = RHU_UPDATE_EVENT) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

function parseQuantity(value) {
  const parsed = parseInt(String(value || "0").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

export function computeMedicineStatus(quantity, lowStockThreshold = 10) {
  const qty = parseQuantity(quantity);
  const threshold = parseQuantity(lowStockThreshold);
  if (qty <= 0) return "Unavailable";
  if (qty <= threshold) return "Low Stock";
  return "Available";
}

function normalizeMedicine(item = {}) {
  const quantity = parseQuantity(item.quantity);
  const lowStockThreshold = parseQuantity(
    item.low_stock_threshold ?? item.lowStockThreshold ?? 10,
  );
  const status =
    item.availability_status ||
    item.status ||
    computeMedicineStatus(quantity, lowStockThreshold);

  return {
    ...item,
    id: item.id ? String(item.id) : "",
    name: item.name || "",
    category: item.category || "",
    description: item.description || item.notes || "",
    quantity,
    lowStockThreshold,
    unit: item.unit || "pcs",
    status,
    availabilityStatus: status,
    expiryDate: item.expiration_date || item.expiryDate || "",
    ruralHealthUnitId: item.rural_health_unit_id || item.ruralHealthUnitId || "",
    barangayHealthCenterId:
      item.barangay_health_center_id || item.barangayHealthCenterId || "",
    updatedAt: item.updated_at || item.updatedAt || "",
    updated_at: item.updated_at || item.updatedAt || "",
    createdAt: item.created_at || item.createdAt || "",
    created_at: item.created_at || item.createdAt || "",
    lastUpdated: item.updated_at || item.updatedAt || item.lastUpdated || "",
    updatedBy: item.updatedBy || item.updated_by || "",
    notes: item.description || item.notes || "",
  };
}

function toCreatePayload(item = {}) {
  return {
    name: item.name,
    category: item.category || null,
    description: item.description || item.notes || null,
    quantity: parseQuantity(item.quantity),
    low_stock_threshold: parseQuantity(item.lowStockThreshold ?? item.low_stock_threshold ?? 10),
    unit: item.unit || "pcs",
    expiration_date: item.expiryDate || item.expirationDate || item.expiration_date || null,
  };
}

function toMetadataPayload(item = {}) {
  return {
    name: item.name,
    category: item.category || null,
    description: item.description || item.notes || null,
    low_stock_threshold: parseQuantity(
      item.lowStockThreshold ?? item.low_stock_threshold ?? 10,
    ),
    unit: item.unit || "pcs",
    expiration_date:
      item.expiryDate || item.expirationDate || item.expiration_date || null,
  };
}

export async function refreshRhuMedicines() {
  loadingPromise = apiRequest("/medicines")
    .then((response) => {
      medicineCache = unwrapList(response).map(normalizeMedicine);
      emit(RHU_UPDATE_EVENT);
      emit(BHC_UPDATE_EVENT);
      return medicineCache;
    })
    .catch(() => {
      medicineCache = [];
      emit(RHU_UPDATE_EVENT);
      emit(BHC_UPDATE_EVENT);
      return medicineCache;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export async function loadMedicineAvailability() {
  const response = await apiRequest("/medicines");
  medicineCache = unwrapList(response).map(normalizeMedicine);
  emit(RHU_UPDATE_EVENT);
  emit(BHC_UPDATE_EVENT);
  return medicineCache;
}

export function getRhuMedicines() {
  if (!loadingPromise) refreshRhuMedicines();
  return medicineCache.filter((item) => item.ruralHealthUnitId);
}

export async function saveRhuMedicines() {
  return refreshRhuMedicines();
}

export async function addRhuMedicine(data) {
  const response = await apiRequest("/medicines", {
    method: "POST",
    body: toCreatePayload(data),
  });
  const created = normalizeMedicine(unwrapData(response));
  medicineCache = [created, ...medicineCache.filter((item) => item.id !== created.id)];
  emit(RHU_UPDATE_EVENT);
  emit(BHC_UPDATE_EVENT);
  return medicineCache;
}

export async function updateRhuMedicine(id, data) {
  const response = await apiRequest(`/medicines/${id}`, {
    method: "PATCH",
    body: toMetadataPayload(data),
  });
  const updated = normalizeMedicine(unwrapData(response));
  medicineCache = medicineCache.map((item) => (item.id === String(id) ? updated : item));
  emit(RHU_UPDATE_EVENT);
  emit(BHC_UPDATE_EVENT);
  return medicineCache;
}

export async function deleteRhuMedicine(id) {
  await apiRequest(`/medicines/${id}`, { method: "DELETE" });
  medicineCache = medicineCache.filter((item) => item.id !== String(id));
  emit(RHU_UPDATE_EVENT);
  emit(BHC_UPDATE_EVENT);
  return medicineCache;
}

export function getBhcMedicines() {
  if (!loadingPromise) refreshRhuMedicines();
  return medicineCache.filter((item) => !item.ruralHealthUnitId);
}

export async function saveBhcMedicines() {
  return refreshRhuMedicines();
}

export async function addBhcMedicine(data) {
  return addRhuMedicine({
    ...data,
    ruralHealthUnitId: "",
    rhuId: "",
  });
}

export async function updateBhcMedicine(id, data) {
  return updateRhuMedicine(id, {
    ...data,
    ruralHealthUnitId: "",
    rhuId: "",
  });
}

export async function deleteBhcMedicine(id) {
  return deleteRhuMedicine(id);
}

export async function restockMedicine(id, data) {
  return mutateMedicineInventory(id, "restock", {
    quantity: parseQuantity(data.quantity),
    reason: String(data.reason || "").trim(),
  });
}

export async function adjustMedicine(id, data) {
  return mutateMedicineInventory(id, "adjust", {
    action: data.action,
    direction: data.action === "correction" ? data.direction : null,
    quantity: parseQuantity(data.quantity),
    reason: String(data.reason || "").trim(),
  });
}

export async function loadMedicineTransactions(id, page = 1) {
  return apiRequest(`/medicines/${id}/transactions?page=${page}`);
}

async function mutateMedicineInventory(id, operation, body) {
  const response = await apiRequest(`/medicines/${id}/${operation}`, {
    method: "POST",
    body,
  });
  const payload = unwrapData(response);
  const updated = normalizeMedicine(payload?.medicine || {});
  medicineCache = medicineCache.map((item) =>
    item.id === String(id) ? updated : item,
  );
  emit(RHU_UPDATE_EVENT);
  emit(BHC_UPDATE_EVENT);

  return {
    items: medicineCache,
    transaction: payload?.transaction || null,
  };
}

export function formatMedicineQuantity(item) {
  return `${parseQuantity(item.quantity).toLocaleString()} ${item.unit || ""}`.trim();
}

export function getMedicineExpiryStatus(item) {
  if (!item?.expiryDate) return "Valid";
  const expiry = new Date(item.expiryDate);
  if (Number.isNaN(expiry.getTime())) return "Valid";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  if (expiry < today) return "Expired";
  if (expiry <= thirtyDaysFromNow) return "Expiring Soon";
  return "Valid";
}

export const RHU_MEDICINES_UPDATED_EVENT = RHU_UPDATE_EVENT;
export const BHC_MEDICINES_UPDATED_EVENT = BHC_UPDATE_EVENT;
