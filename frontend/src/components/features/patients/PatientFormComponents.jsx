// CORRECTED IMPORTS: Import specific files directly instead of the directory
import FormInput from "../../common/forms/FormInput";
import { getPhilippineLocalNumber } from "../../../utils/patientUtils";

// --- THEME CONSTANTS ---
export const THEME = {
  primary: "#B91C1C", // Red
  primaryLight: "#FEF2F2",
  primaryDark: "#991B1B",
  border: "#E5E7EB",
  textMuted: "#6B7280",
};

// --- SECTION HEADER COMPONENT ---
export const SectionHeader = ({ icon: Icon, title, description }) => (
  <div className="mb-4 flex min-w-0 items-center gap-2.5">
    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-50 text-[#B91C1C]">
      <Icon size={14} />
    </div>
    <div className="min-w-0">
      <h2 className="text-sm font-bold text-[#1A1A1A]">{title}</h2>
      {description && (
        <p className="text-xs leading-relaxed text-[#6B7280]">{description}</p>
      )}
    </div>
  </div>
);

// --- PHILIPPINE CONTACT INPUT ---
function PhilippinesFlag() {
  return (
    <span className="relative inline-block h-3 w-5 shrink-0 overflow-hidden rounded-sm shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1/2 bg-[#0038A8]" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[#CE1126]" />
      <span
        className="absolute left-0 top-0 h-full w-[58%] bg-white"
        style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)" }}
      />
      <span className="absolute left-[3px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-[#FCD116]" />
    </span>
  );
}

export const PhilippineContactInput = ({
  label,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  helperText,
  error,
}) => {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <div
        className={`group relative flex h-10 min-w-0 overflow-hidden rounded-lg border bg-white transition-all duration-200 focus-within:border-[#B91C1C] focus-within:ring-2 focus-within:ring-[#B91C1C]/10 ${
          error
            ? "border-[#B91C1C] ring-2 ring-[#B91C1C]/10"
            : "border-[#E5E7EB] hover:border-[#D1D5DB]"
        } ${disabled ? "bg-[#F9FAFB] opacity-75" : ""}`}
      >
        <div className="flex shrink-0 items-center gap-2 border-r border-[#E5E7EB] bg-[#F9FAFB] px-3 text-sm font-medium text-[#6B7280]">
          <PhilippinesFlag />
          <span>+63</span>
        </div>
        <input
          type="tel"
          name={name}
          value={getPhilippineLocalNumber(value)}
          onChange={onChange}
          inputMode="numeric"
          maxLength={10}
          placeholder="912 345 6789"
          required={required}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent px-3.5 text-sm text-[#1F2937] outline-none placeholder:text-[#9CA3AF] disabled:cursor-not-allowed disabled:text-slate-500"
        />
      </div>
      {error && (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#B91C1C]">
          {error}
        </p>
      )}
      {helperText && (
        <p className="mt-1 text-[10px] leading-relaxed text-[#64748B]">
          {helperText}
        </p>
      )}
    </div>
  );
};

// --- TPAL HISTORY GRID (Maternal Specific) ---
export const TpalHistoryGrid = ({ form, onChange }) => {
  const fields = [
    { label: "Term (T)", name: "term", placeholder: "0" },
    { label: "Preterm (P)", name: "preterm", placeholder: "0" },
    { label: "Abortion (A)", name: "abortion", placeholder: "0" },
    { label: "Living (L)", name: "living", placeholder: "0" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 rounded-xl bg-[#FEF2F2] border border-[#FECACA]">
      {fields.map((field) => (
        <FormInput
          key={field.name}
          label={field.label}
          name={field.name}
          type="number"
          value={form[field.name]}
          onChange={onChange}
          placeholder={field.placeholder}
        />
      ))}
    </div>
  );
};
