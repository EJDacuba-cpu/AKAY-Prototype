import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function AddMedicineItem() {
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    itemName: "",
    category: "",
    quantity: "",
    unit: "pcs",
    minimumStock: "20",
    expiryDate: "",
    lastUpdated: today,
    notes: "",
  });

  const computedStatus = useMemo(() => {
    const quantity = Number(form.quantity);
    const minimumStock = Number(form.minimumStock);

    if (!form.quantity) return "Not Set";
    if (quantity <= 0) return "Unavailable";
    if (quantity <= minimumStock) return "Low Stock";
    return "Available";
  }, [form.quantity, form.minimumStock]);

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Frontend demo only.
    // Later, this will send data to Laravel API and save to Supabase PostgreSQL.
    navigate("/rhu/medicine-management");
  }

  return (
    <DashboardLayout role="rhu" title="Add Medicine Item">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
          Add Medicine / Resource Item
        </h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Add RHU medicine, supplies, vaccines, or referral-related resources
          for availability tracking.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Item Information
          </h2>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <FieldInput
              label="Item Name"
              name="itemName"
              value={form.itemName}
              onChange={handleChange}
              placeholder="Example: Paracetamol"
              required
            />

            <FieldSelect
              label="Category"
              name="category"
              value={form.category}
              onChange={handleChange}
              required
            >
              <option value="">Select category</option>
              <option>Basic Medicines</option>
              <option>Vaccines</option>
              <option>Medical Supplies</option>
              <option>Maternal Care Supplies</option>
              <option>Child Health Supplies</option>
              <option>Referral-related Resources</option>
            </FieldSelect>

            <FieldSelect
              label="Unit"
              name="unit"
              value={form.unit}
              onChange={handleChange}
              required
            >
              <option>pcs</option>
              <option>boxes</option>
              <option>bottles</option>
              <option>vials</option>
              <option>packs</option>
              <option>sets</option>
            </FieldSelect>

            <FieldInput
              label="Current Quantity"
              name="quantity"
              type="number"
              value={form.quantity}
              onChange={handleChange}
              placeholder="0"
              required
            />

            <FieldInput
              label="Minimum Stock Level"
              name="minimumStock"
              type="number"
              value={form.minimumStock}
              onChange={handleChange}
              placeholder="20"
              required
            />

            <FieldInput
              label="Expiry Date"
              name="expiryDate"
              type="date"
              value={form.expiryDate}
              onChange={handleChange}
            />

            <FieldInput
              label="Last Updated"
              name="lastUpdated"
              type="date"
              value={form.lastUpdated}
              onChange={handleChange}
              required
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">
            Availability Status
          </h2>
          <p className="mt-1 text-xs text-[#6B7280]">
            Status is automatically suggested based on current quantity and
            minimum stock level.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-[#E8ECF0] bg-[#F8FAFC] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Computed Status
              </p>

              <div className="mt-3">
                <StatusBadge status={computedStatus} />
              </div>
            </div>

            <div className="rounded-xl border border-[#E8ECF0] bg-[#F8FAFC] p-5 lg:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                Rule
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
                Quantity 0 means <strong>Unavailable</strong>. Quantity less
                than or equal to the minimum stock level means{" "}
                <strong>Low Stock</strong>. Quantity above minimum stock means{" "}
                <strong>Available</strong>.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#E8ECF0] bg-white p-6">
          <h2 className="text-sm font-semibold text-[#0B2E59]">Notes</h2>

          <div className="mt-5">
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              className="min-h-28 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 py-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
              placeholder="Example: Available for fever cases, limited supply, for referral-related use only..."
            />
          </div>
        </section>

        <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-xs leading-relaxed text-[#4B5563]">
            <span className="font-semibold text-[#0B2E59]">Note:</span> This
            module tracks medicine and resource availability only. It does not
            handle pharmacy dispensing, billing, or prescription transactions.
          </p>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/rhu/medicine-management")}
            className="rounded-lg border border-[#E8ECF0] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F9FAFB]"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
          >
            Save Item
          </button>
        </div>
      </form>
    </DashboardLayout>
  );
}

function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E8ECF0] bg-[#FAFBFC] px-3 text-sm outline-none focus:border-[#0B2E59]/20 focus:bg-white focus:ring-4 focus:ring-[#0B2E59]/[0.04]"
      >
        {children}
      </select>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    Available: "bg-emerald-50 text-emerald-700",
    "Low Stock": "bg-amber-50 text-amber-700",
    Unavailable: "bg-red-50 text-red-700",
    "Not Set": "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-block rounded-md px-3 py-1 text-xs font-semibold ${
        map[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

