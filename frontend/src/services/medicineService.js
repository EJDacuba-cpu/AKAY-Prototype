import { createRoleNotification } from "./notificationService";

const RHU_STORAGE_KEY = "akay_rhu_medicines";
const BHC_STORAGE_KEY = "akay_bhc_medicines";
const RHU_UPDATE_EVENT = "akay_rhu_medicines_updated";
const BHC_UPDATE_EVENT = "akay_bhc_medicines_updated";

export const MEDICINE_CATEGORIES = [
  "Basic Medicines",
  "Vaccines",
  "Medical Supplies",
  "Maternal Care Supplies",
  "Child Health Supplies",
  "Referral-related Resources",
];

export const MEDICINE_UNITS = [
  "pcs",
  "sachets",
  "bottles",
  "packs",
  "vials",
  "boxes",
  "ml",
  "mg",
];

const DEFAULT_RHU_MEDICINES = [
  {
    id: "MED-001",
    name: "Paracetamol 500mg",
    category: "Basic Medicines",
    quantity: 120,
    unit: "pcs",
    lowStockThreshold: 20,
    expiryDate: "2026-12-31",
    notes: "Available for common fever and pain cases.",
  },
  {
    id: "MED-002",
    name: "Amoxicillin 250mg",
    category: "Basic Medicines",
    quantity: 15,
    unit: "pcs",
    lowStockThreshold: 20,
    expiryDate: "2026-10-31",
    notes: "Limited supply. Coordinate before referral planning.",
  },
  {
    id: "MED-003",
    name: "Tetanus Vaccine",
    category: "Vaccines",
    quantity: 0,
    unit: "vials",
    lowStockThreshold: 5,
    expiryDate: "2026-08-31",
    notes: "Currently unavailable.",
  },
  {
    id: "MED-004",
    name: "Prenatal Vitamins",
    category: "Maternal Care Supplies",
    quantity: 45,
    unit: "pcs",
    lowStockThreshold: 10,
    expiryDate: "2027-01-31",
    notes: "Available for maternal care referrals.",
  },
];

const DEFAULT_BHC_MEDICINES = [
  {
    id: "BHC-001",
    name: "Paracetamol 500mg",
    category: "Basic Medicines",
    quantity: 85,
    unit: "pcs",
    lowStockThreshold: 20,
    expiryDate: "2026-12-31",
    notes: "For common fever and pain.",
  },
  {
    id: "BHC-002",
    name: "Amoxicillin 250mg",
    category: "Basic Medicines",
    quantity: 12,
    unit: "pcs",
    lowStockThreshold: 20,
    expiryDate: "2026-10-31",
    notes: "Antibiotic for bacterial infections.",
  },
  {
    id: "BHC-003",
    name: "Oral Rehydration Salts",
    category: "Basic Medicines",
    quantity: 60,
    unit: "sachets",
    lowStockThreshold: 15,
    expiryDate: "2027-03-31",
    notes: "For dehydration cases.",
  },
  {
    id: "BHC-004",
    name: "Disposable Syringe 5ml",
    category: "Medical Supplies",
    quantity: 8,
    unit: "pcs",
    lowStockThreshold: 15,
    expiryDate: "2028-01-31",
    notes: "For injections and vaccinations.",
  },
];

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseQuantity(value) {
  if (typeof value === "number") return value;
  const parsed = parseInt(String(value || "0").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function inferUnit(value, fallback = "pcs") {
  if (!value || typeof value !== "string") return fallback;
  const found = MEDICINE_UNITS.find((unit) =>
    new RegExp(`\\b${unit}\\b`, "i").test(value),
  );
  return found || fallback;
}

export function computeMedicineStatus(quantity, lowStockThreshold) {
  const qty = parseQuantity(quantity);
  const threshold = parseQuantity(lowStockThreshold);

  if (qty <= 0) return "Unavailable";
  if (qty <= threshold) return "Low Stock";
  return "Available";
}

function normalizeMedicine(item, source, index = 0) {
  const quantity = parseQuantity(item.quantity);
  const lowStockThreshold = parseQuantity(
    item.lowStockThreshold ?? item.threshold ?? 10,
  );
  const unit = item.unit || inferUnit(item.quantity);

  return {
    id:
      item.id ||
      `${source === "RHU" ? "MED" : "BHC"}-${String(index + 1).padStart(
        3,
        "0",
      )}`,
    name: item.name || "Unnamed Medicine",
    category: item.category || "Basic Medicines",
    quantity,
    unit,
    lowStockThreshold,
    status: computeMedicineStatus(quantity, lowStockThreshold),
    expiryDate: item.expiryDate || "",
    lastUpdated: item.lastUpdated || todayLabel(),
    updatedBy: item.updatedBy || (source === "RHU" ? "RHU Staff" : "BHC Staff"),
    notes: item.notes || "",
    source,
  };
}

function normalizeMedicines(items, source) {
  return (Array.isArray(items) ? items : []).map((item, index) =>
    normalizeMedicine(item, source, index),
  );
}

function getStorageItems(key, defaults, source) {
  if (typeof window === "undefined") {
    return normalizeMedicines(defaults, source);
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      const seeded = normalizeMedicines(defaults, source);
      window.localStorage.setItem(key, JSON.stringify(seeded));
      return seeded;
    }

    return normalizeMedicines(JSON.parse(raw), source);
  } catch {
    return normalizeMedicines(defaults, source);
  }
}

function saveStorageItems(key, eventName, items, source) {
  const normalized = normalizeMedicines(items, source);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(normalized));
    window.dispatchEvent(new Event(eventName));
  }

  return normalized;
}

function createNextId(items, prefix) {
  const max = items.reduce((highest, item) => {
    const value = parseInt(String(item.id || "").replace(/[^\d]/g, ""), 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function createMedicinePayload(data, source, id) {
  const quantity = parseQuantity(data.quantity);
  const lowStockThreshold = parseQuantity(data.lowStockThreshold);

  return normalizeMedicine(
    {
      ...data,
      id,
      quantity,
      lowStockThreshold,
      lastUpdated: todayLabel(),
      updatedBy: source === "RHU" ? "RHU Staff" : "BHC Staff",
    },
    source,
  );
}

function shouldNotifyMedicineStatus(status) {
  return status === "Low Stock" || status === "Unavailable";
}

function notifyBhcMedicineAvailability(item) {
  if (!shouldNotifyMedicineStatus(item.status)) return;

  createRoleNotification("bhc", {
    title: "Medicine availability updated",
    message: `${item.name} is now ${item.status}.`,
    type: "medicine",
    referenceId: `${item.id}-${item.status}`,
    link: "/bhc/medicine-availability",
    sender: "RHU Medicine Management",
  });
}

export function getRhuMedicines() {
  return getStorageItems(RHU_STORAGE_KEY, DEFAULT_RHU_MEDICINES, "RHU");
}

export function saveRhuMedicines(items) {
  return saveStorageItems(RHU_STORAGE_KEY, RHU_UPDATE_EVENT, items, "RHU");
}

export function addRhuMedicine(data) {
  const items = getRhuMedicines();
  const next = createMedicinePayload(data, "RHU", createNextId(items, "MED"));
  const saved = saveRhuMedicines([next, ...items]);
  notifyBhcMedicineAvailability(next);
  return saved;
}

export function updateRhuMedicine(id, data) {
  const items = getRhuMedicines();
  const previous = items.find((item) => item.id === id);
  let updatedItem = null;
  const saved = saveRhuMedicines(
    items.map((item) => {
      if (item.id !== id) return item;
      updatedItem = createMedicinePayload(data, "RHU", id);
      return updatedItem;
    }),
  );

  if (updatedItem && updatedItem.status !== previous?.status) {
    notifyBhcMedicineAvailability(updatedItem);
  }

  return saved;
}

export function deleteRhuMedicine(id) {
  return saveRhuMedicines(getRhuMedicines().filter((item) => item.id !== id));
}

export function getBhcMedicines() {
  return getStorageItems(BHC_STORAGE_KEY, DEFAULT_BHC_MEDICINES, "BHC");
}

export function saveBhcMedicines(items) {
  return saveStorageItems(BHC_STORAGE_KEY, BHC_UPDATE_EVENT, items, "BHC");
}

export function addBhcMedicine(data) {
  const items = getBhcMedicines();
  const next = createMedicinePayload(data, "BHC", createNextId(items, "BHC"));
  return saveBhcMedicines([next, ...items]);
}

export function updateBhcMedicine(id, data) {
  const items = getBhcMedicines();
  return saveBhcMedicines(
    items.map((item) =>
      item.id === id ? createMedicinePayload(data, "BHC", id) : item,
    ),
  );
}

export function deleteBhcMedicine(id) {
  return saveBhcMedicines(getBhcMedicines().filter((item) => item.id !== id));
}

export function formatMedicineQuantity(item) {
  return `${parseQuantity(item.quantity)} ${item.unit || "pcs"}`;
}

export function getMedicineExpiryStatus(item) {
  if (!item.expiryDate) return "Valid";

  const expiry = new Date(item.expiryDate);
  if (Number.isNaN(expiry.getTime())) return "Valid";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (expiry < today) return "Expired";

  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  return expiry <= thirtyDaysFromNow ? "Expiring Soon" : "Valid";
}

export const RHU_MEDICINES_UPDATED_EVENT = RHU_UPDATE_EVENT;
export const BHC_MEDICINES_UPDATED_EVENT = BHC_UPDATE_EVENT;
