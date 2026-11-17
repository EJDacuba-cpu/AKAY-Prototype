// CORRECTED IMPORTS: Import specific files directly instead of the directory
import FormInput from "../../common/forms/FormInput";


// --- THEME CONSTANTS ---
export const THEME = {
  primary: "#DC2626", // Red
  primaryLight: "#FEF2F2",
  primaryDark: "#B91C1C",
  border: "#E5E7EB",
  textMuted: "#6B7280",
};

// --- SECTION HEADER COMPONENT ---
export const SectionHeader = ({ icon: Icon, title, description }) => (
  <div className="mb-4 flex min-w-0 items-center gap-2.5">
    <div className="flex h-6 w-6 items-center justify-center rounded-none bg-red-50 text-red-600">
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

// Shared plain local contact field; input handling and final validation live in registration helpers.
export const PhilippineContactInput = (props) => (
  <FormInput {...props} type="text" inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX" />
);

// --- TPAL HISTORY GRID (Maternal Specific) ---
export const TpalHistoryGrid = ({ form, onChange }) => {
  const fields = [
    { label: "Term (T)", name: "term", placeholder: "0" },
    { label: "Preterm (P)", name: "preterm", placeholder: "0" },
    { label: "Abortion (A)", name: "abortion", placeholder: "0" },
    { label: "Living (L)", name: "living", placeholder: "0" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-6 rounded-none bg-red-50 border border-red-200">
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
