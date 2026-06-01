import {
  FileText,
  MapPinHouse,
  UserPlus,
  Activity,
  Baby,
  HeartPulse,
} from "lucide-react";

// CORRECTED IMPORTS: Import specific files directly instead of the directory
import FormInput from "../../common/forms/FormInput";
import FormSelect from "../../common/forms/FormSelect";
import FormTextarea from "../../common/forms/FormTextarea";
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
  <div className="mb-6">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
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
}) => {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-xs font-semibold text-gray-700">
        {label}
        {required && <span className="ml-1 text-[#B91C1C]">*</span>}
      </label>
      <div className="group relative flex h-11 overflow-hidden rounded-lg border border-gray-300 bg-gray-50/50 transition-all duration-200 focus-within:border-[#B91C1C] focus-within:ring-2 focus-within:ring-[#B91C1C]/20">
        <div className="flex shrink-0 items-center gap-2 border-r border-gray-300 bg-white px-3 text-sm font-medium text-gray-500 group-focus-within:bg-gray-50">
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
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>
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
