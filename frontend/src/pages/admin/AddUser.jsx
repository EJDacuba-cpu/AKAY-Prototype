import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Info,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import useForm from "../../hooks/useForm";

import FormGroup from "../../components/common/atoms/FormGroup";
import Input from "../../components/common/atoms/Input";
import Select from "../../components/common/atoms/Select";

import DashboardLayout from "../../components/layout/DashboardLayout";
import {
  createAdminAccount,
  getAdminAccounts,
  updateAdminAccount,
} from "../../services/adminAccountsService";

import { validators } from "../../utils/validators";

const BHC_FACILITIES = [
  "Pitpitan Health Center",
  "Taliptip Health Center",
  "San Jose Health Center",
  "Bagumbayan Health Center",
  "Bambang Health Center",
  "Balubad Health Center",
  "Matungao Health Center",
  "Maysantol Health Center",
  "Perez Health Center",
  "San Francisco Health Center",
  "San Nicolas Health Center",
  "Santa Ana Health Center",
  "Santa Ines Health Center",
  "Tibig Health Center",
];

const ACCOUNT_ROLES = [
  {
    value: "bhc_worker",
    label: "Barangay Health Center Worker",
    accessRole: "BHC",
    facilities: BHC_FACILITIES,
  },
  {
    value: "rhu_staff",
    label: "Rural Health Unit Staff",
    accessRole: "RHU",
    facilities: ["Rural Health Unit Bulakan"],
  },
];

const POSITION_BY_ACCOUNT_ROLE = {
  bhc_worker: ["Barangay Health Worker", "Midwife", "BHC Staff"],
  rhu_staff: ["RHU Staff", "Encoder", "Nurse", "Receiving Staff"],
};

const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .anim-fade-up {
    animation: fadeUp 0.45s cubic-bezier(0.22,1,0.36,1) both;
  }
`;

const stagger = (index) => ({ animationDelay: `${index * 55}ms` });

export default function AddUser() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [successModal, setSuccessModal] = useState(null);
  const mode = searchParams.get("mode");
  const userId = searchParams.get("userId");

  const existingUser = useMemo(() => {
    if (!userId) return null;
    return getAdminAccounts().find((account) => account.id === userId) || null;
  }, [userId]);

  const isEditMode = mode === "edit" && !!existingUser;

  const form = useForm(
    getInitialValues(existingUser),
    async (values) => {
      const accountRole = getAccountRole(values.accountRole);

      const payload = {
        fullName: values.fullName,
        name: values.fullName,
        email: values.email,
        contactNumber: values.contactNumber,
        role: accountRole?.accessRole || "",
        accountRole: accountRole?.value || "",
        accountRoleLabel: accountRole?.label || "",
        position: values.position,
        facility: values.facility,
        status: existingUser?.status || "Active",
      };

      if (isEditMode) {
        updateAdminAccount(existingUser.id, payload);
        setSuccessModal({
          title: "Account Updated Successfully",
          message: "The account has been updated successfully.",
        });
      } else {
        createAdminAccount(payload);
        setSuccessModal({
          title: "Account Added Successfully",
          message: "The account has been created successfully.",
        });
      }
    },
    {
      fullName: validators.required,
      email: validators.email,
      accountRole: validators.required,
      position: validators.required,
      facility: validators.required,
    },
  );

  const selectedAccountRole = getAccountRole(form.values.accountRole);

  const availablePositions = useMemo(() => {
    return POSITION_BY_ACCOUNT_ROLE[form.values.accountRole] || [];
  }, [form.values.accountRole]);

  const availableFacilities = useMemo(() => {
    return selectedAccountRole?.facilities || [];
  }, [selectedAccountRole]);

  function handleAccountChange(event) {
    const { name, value } = event.target;

    form.setValues((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "accountRole") {
        const selected = getAccountRole(value);
        const facilities = selected?.facilities || [];
        const positions = POSITION_BY_ACCOUNT_ROLE[value] || [];

        next.position =
          positions.length === 1
            ? positions[0]
            : positions.includes(prev.position)
              ? prev.position
              : "";

        next.facility =
          facilities.length === 1
            ? facilities[0]
            : facilities.includes(prev.facility)
              ? prev.facility
              : "";
      }

      return next;
    });
  }

  return (
    <DashboardLayout
      role="admin"
      title={isEditMode ? "Edit User Account" : "Add User Account"}
    >
      <style>{keyframes}</style>

      <div className="mx-auto max-w-5xl pb-4">
        <div className="anim-fade-up mb-6" style={stagger(0)}>
          <button
            type="button"
            onClick={() => navigate("/admin/users")}
            className="mb-2 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0F172A] transition-all duration-200 hover:gap-2.5 hover:text-[#991B1B]"
          >
            <ArrowLeft size={16} />
            Back to Account Directory
          </button>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#1A1A1A]">
                {isEditMode ? "Edit User Account" : "Add User Account"}
              </h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
                {isEditMode
                  ? "Update the account role, position, and facility assignment. Password changes are handled separately by Admin/MHO from the account directory."
                  : "Add an authorized account for Barangay Health Center workers or Rural Health Unit staff."}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={form.handleSubmit} className="space-y-5 pb-4">
          <FormSection
            title="Account Information"
            subtitle="Enter the staff member's basic account details."
            icon={<UserPlus size={14} />}
            delay={1}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <FormGroup
                label="Full Name"
                error={form.errors.fullName}
                required
              >
                <Input
                  name="fullName"
                  value={form.values.fullName}
                  onChange={handleAccountChange}
                  placeholder="Example: Juan Dela Cruz"
                />
              </FormGroup>

              <FormGroup
                label="Email Address"
                error={form.errors.email}
                required
              >
                <Input
                  name="email"
                  type="email"
                  value={form.values.email}
                  onChange={handleAccountChange}
                  placeholder="example@akay.local"
                />
              </FormGroup>

              <FormGroup
                label="Contact Number"
                error={form.errors.contactNumber}
              >
                <Input
                  name="contactNumber"
                  value={form.values.contactNumber}
                  onChange={handleAccountChange}
                  placeholder="09XXXXXXXXX"
                />
              </FormGroup>
            </div>
          </FormSection>

          <FormSection
            title="Role and Assignment"
            subtitle="Select the account role first, then choose the matching position and facility assignment."
            icon={<Building2 size={14} />}
            delay={2}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <FormGroup
                label="Account Role"
                error={form.errors.accountRole}
                required
              >
                <Select
                  name="accountRole"
                  value={form.values.accountRole}
                  onChange={handleAccountChange}
                  options={[
                    { value: "", label: "Select account role" },
                    ...ACCOUNT_ROLES.map((role) => ({
                      value: role.value,
                      label: role.label,
                    })),
                  ]}
                />
              </FormGroup>

              <FormGroup
                label="Facility / Assignment"
                error={form.errors.facility}
                required
              >
                <Select
                  name="facility"
                  value={form.values.facility}
                  onChange={handleAccountChange}
                  options={[
                    { value: "", label: "Select facility" },
                    ...availableFacilities.map((facility) => ({
                      value: facility,
                      label: facility,
                    })),
                  ]}
                />
              </FormGroup>
            </div>

            {selectedAccountRole?.description && (
              <InfoNotice className="mt-5" icon={<Info size={16} />}>
                {selectedAccountRole.description}
                {form.values.position
                  ? ` Position selected: ${form.values.position}.`
                  : ""}
              </InfoNotice>
            )}
          </FormSection>

          <div
            className="anim-fade-up flex items-center justify-end gap-3 pt-1"
            style={stagger(5)}
          >
            <button
              type="button"
              onClick={() => navigate("/admin/users")}
              className="h-10 rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.isSubmitting}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#B91C1C] px-6 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UserPlus size={14} strokeWidth={2.5} />
              {isEditMode ? "Save Changes" : "Save User Account"}
            </button>
          </div>
        </form>
      </div>

      {successModal && (
        <SuccessModal
          modal={successModal}
          onClose={() => navigate("/admin/users")}
        />
      )}
    </DashboardLayout>
  );
}

function FormSection({ title, subtitle, icon, children, delay = 0 }) {
  return (
    <section
      className="anim-fade-up rounded-2xl border border-slate-200/80 border-t-2 border-t-[#B91C1C] bg-white shadow-sm"
      style={stagger(delay)}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
          {icon}
        </div>
        <div>
          <h2 className="text-[13px] font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function InfoNotice({ children, className = "", icon }) {
  return (
    <div
      className={`rounded-xl border border-red-100 bg-red-50/70 px-4 py-3 ${className}`}
    >
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0 text-[#0F172A]">
          {icon || <ShieldCheck size={16} />}
        </span>
        <p className="text-xs leading-relaxed text-slate-600">{children}</p>
      </div>
    </div>
  );
}

function SuccessModal({ modal, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="px-6 py-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={30} />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{modal.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {modal.message}
          </p>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B]"
          >
            Back to Account Directory
          </button>
        </div>
      </div>
    </div>
  );
}

function getInitialValues(user) {
  const inferredAccountRole = getAccountRole(user?.accountRole)
    ? user.accountRole
    : getAccountRoleFromUser(user);
  const accountRole = getAccountRole(inferredAccountRole);
  const positions = POSITION_BY_ACCOUNT_ROLE[inferredAccountRole] || [];
  const facilities = accountRole?.facilities || [];

  return {
    fullName: user?.fullName || user?.name || "",
    email: user?.email || "",
    contactNumber: user?.contactNumber || "",
    accountRole: inferredAccountRole,
    position:
      user?.position && positions.includes(user.position)
        ? user.position
        : positions.length === 1
          ? positions[0]
          : "",
    facility:
      user?.facility && facilities.includes(user.facility)
        ? user.facility
        : facilities.length === 1
          ? facilities[0]
          : "",
  };
}

function getAccountRole(value) {
  return ACCOUNT_ROLES.find((role) => role.value === value) || null;
}

function getAccountRoleFromUser(user) {
  if (!user) return "";

  if (user.role === "Admin") return "admin_mho";
  if (user.role === "BHC") return "bhc_worker";
  if (user.role === "RHU") return "rhu_staff";

  return "";
}
