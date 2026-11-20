import { allocationIntent } from "./medicineExpiryGroups.js";

const stockFields = ["medicineId", "inventoryQuantity", "confirmedGiven", "allocations", "override_reason", "overrideReason"];

export function clinicalVaccineEntries(entries) {
  return entries.map(entry => {
    const clinical = { ...entry };
    for (const field of stockFields) delete clinical[field];
    return clinical;
  });
}

/** Resume both server-enriched and device-only drafts in the single BHC dispensing list. */
export function restoreBhcDispensingDraft({ payload, medicineSelections = [], vaccineEntries, inventory }) {
  const selections = new Map(medicineSelections.map(row => [String(row.medicine_id), row]));
  const warnings = medicineSelections.map(row => row.warning).filter(Boolean);
  const rows = [...(Array.isArray(payload.dispensedMedicines) ? payload.dispensedMedicines : medicineSelections)];
  const manualIds = new Set(rows.map(row => String(row.medicineId || row.medicine_id)));
  const transferred = new Map();

  for (const entry of vaccineEntries) {
    if (!entry.medicineId && !entry.inventoryQuantity && !entry.confirmedGiven) continue;
    const id = String(entry.medicineId || "");
    const quantity = Number(entry.inventoryQuantity);
    const description = `${entry.vaccineName} (stock item ${id || "unspecified"}, quantity ${entry.inventoryQuantity || "unspecified"})`;
    if (entry.confirmedGiven !== true || !id || !Number.isInteger(quantity) || quantity < 1) {
      warnings.push(`Review the earlier EPI stock selection for ${description} in Medicines / Supplies Dispensed.`);
      continue;
    }
    const previous = transferred.get(id);
    if (manualIds.has(id) || (previous && (Array.isArray(previous.allocations) || Array.isArray(entry.allocations)))) {
      warnings.push(`A dispensing row already exists for ${description}. Check its total quantity and batches before completing the visit.`);
      continue;
    }
    if (previous) {
      previous.quantity += quantity;
    } else {
      const row = { medicineId: id, quantity, confirmedGiven: true, remarks: `Administered: ${entry.vaccineName}`, ...allocationIntent(entry) };
      rows.push(row);
      transferred.set(id, row);
    }
  }

  const medicines = rows.map(row => {
    const id = String(row.medicineId || row.medicine_id);
    const selection = selections.get(id);
    const medicine = selection?.medicine || inventory.find(item => String(item.id) === id);
    return {
      ...allocationIntent(row),
      medicineId: id,
      confirmedGiven: row.confirmedGiven === true,
      medicineName: medicine?.name || `Stock item #${id}`,
      category: medicine?.category || "",
      availableStock: medicine?.quantity ?? 0,
      quantity: row.quantity,
      unit: medicine?.unit || "",
      remarks: row.remarks || "",
    };
  });
  return { medicines, warnings };
}
