import { useRef, useState } from "react";
import ModalShell, { ModalButton } from "../../common/modals/ModalShell";
import Input from "../../common/atoms/Input";
import Select from "../../common/atoms/Select";
import { apiRequest } from "../../../services/apiClient";

const EMPTY_FORM = {
  name: "",
  barangay: "",
  address: "",
  contact_information: "",
  status: "active",
  rural_health_unit_id: "",
  alternative_rhu_ids: [],
};

const FORM_ID = "facility-form";
const TEXT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "barangay", label: "Barangay" },
  { key: "address", label: "Address", wide: true },
  { key: "contact_information", label: "Contact information", wide: true },
];

function initialForm(facility) {
  if (!facility) return { ...EMPTY_FORM };

  return {
    ...EMPTY_FORM,
    ...facility,
    alternative_rhu_ids: (facility.alternative_rhus || []).map((rhu) => rhu.id),
  };
}

/**
 * Add / edit form for a BHC or RHU. Mount it only while open so every open starts from
 * a fresh form. `facility` is null when adding. `onSaved` runs (and is awaited) before the modal closes.
 */
export default function FacilityFormModal({ type, facility, rhus, onSaved, onClose }) {
  const [form, setForm] = useState(() => initialForm(facility));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef(null);
  const isBhc = type === "bhc";
  const typeLabel = type.toUpperCase();
  const activeRhus = rhus.filter((rhu) => rhu.status === "active");
  const defaultRhuId = Number(form.rural_health_unit_id);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleAlternative(id, checked) {
    setForm((current) => ({
      ...current,
      alternative_rhu_ids: checked
        ? [...current.alternative_rhu_ids, id]
        : current.alternative_rhu_ids.filter((existing) => existing !== id),
    }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const body = {
        name: form.name,
        barangay: form.barangay,
        address: form.address,
        contact_information: form.contact_information,
        status: form.status,
        ...(isBhc
          ? {
              rural_health_unit_id: defaultRhuId,
              alternative_rhu_ids: form.alternative_rhu_ids.filter((id) => id !== defaultRhuId),
            }
          : {}),
      };
      const resource = isBhc ? "barangay-health-centers" : "rural-health-units";

      await apiRequest(`/${resource}${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PATCH" : "POST",
        body,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(Object.values(e.errors || {}).flat().join(" ") || e.message);
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={`${form.id ? "Edit" : "Add"} ${typeLabel}`}
      subtitle={form.id ? form.name : `Register a new ${typeLabel} facility.`}
      size="xl"
      onClose={onClose}
      closeDisabled={busy}
      initialFocusRef={nameRef}
      footer={
        <>
          <ModalButton onClick={onClose} disabled={busy}>
            Cancel
          </ModalButton>
          <ModalButton type="submit" form={FORM_ID} variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save Facility"}
          </ModalButton>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ key, label, required, wide }) => (
            <label key={key} className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
              {label}
              <Input
                ref={key === "name" ? nameRef : undefined}
                required={required}
                value={form[key] || ""}
                onChange={(event) => update(key, event.target.value)}
              />
            </label>
          ))}
          <label className="block text-sm">
            Status
            <Select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </label>
        </div>

        {isBhc && (
          <>
            <label className="block text-sm">
              Default receiving RHU
              <Select
                required
                placeholder="Select default RHU"
                value={form.rural_health_unit_id || ""}
                onChange={(event) => update("rural_health_unit_id", Number(event.target.value))}
                options={activeRhus.map((rhu) => ({ value: rhu.id, label: rhu.name }))}
              />
            </label>

            <fieldset className="rounded-lg border border-slate-200 p-4">
              <legend className="px-2 text-sm font-semibold">Approved alternative RHUs</legend>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {activeRhus
                  .filter((rhu) => rhu.id !== defaultRhuId)
                  .map((rhu) => (
                    <label key={rhu.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.alternative_rhu_ids.includes(rhu.id)}
                        onChange={(event) => toggleAlternative(rhu.id, event.target.checked)}
                      />
                      {rhu.name}
                    </label>
                  ))}
              </div>
            </fieldset>

            <p className="text-xs text-slate-500">
              Changes apply to future routing. Historical referral destinations and staff assignments
              remain unchanged.
            </p>
          </>
        )}
      </form>
    </ModalShell>
  );
}
