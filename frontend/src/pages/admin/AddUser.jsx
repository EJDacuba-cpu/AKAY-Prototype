import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  Hospital,
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

const RHU_FACILITIES = ["Rural Health Unit Bulakan"];
const DEFAULT_RHU_FACILITY = RHU_FACILITIES[0];

const ACCOUNT_ROLES = [
  {
    value: "bhc_worker",
    label: "BHC Account",
    roleLabel: "Barangay Health Center Worker",
    subtitle: "Barangay Health Center",
    accessRole: "BHC",
    facilities: BHC_FACILITIES,
    workflowTitle: "BHC to RHU referral workflow",
    workflowDescription:
      "This account can encode BHC patients, create health records, and send referrals to the assigned Rural Health Unit.",
  },
  {
    value: "rhu_staff",
    label: "RHU Account",
    roleLabel: "Rural Health Unit Staff",
    subtitle: "Rural Health Unit",
    accessRole: "RHU",
    facilities: RHU_FACILITIES,
    workflowTitle: "RHU receiving and processing workflow",
    workflowDescription:
      "This account can receive referrals, check in patients, manage RHU records, and submit feedback/return slips.",
  },
];

const POSITION_BY_ACCOUNT_ROLE = {
  bhc_worker: "Barangay Health Worker",
  rhu_staff: "RHU Staff",
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

  const [currentStep, setCurrentStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [stepErrors, setStepErrors] = useState({});
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
      const isBhcAccount = values.accountRole === "bhc_worker";
      const isRhuAccount = values.accountRole === "rhu_staff";
      const selectedFacility = isBhcAccount
        ? values.bhcFacility
        : isRhuAccount
          ? values.rhuFacility
          : "";

      const payload = {
        fullName: values.fullName.trim(),
        name: values.fullName.trim(),
        email: values.email.trim(),
        contactNumber: values.contactNumber || "",
        role: accountRole?.accessRole || "",
        accountRole: accountRole?.value || "",
        accountRoleLabel: accountRole?.roleLabel || "",
        position: POSITION_BY_ACCOUNT_ROLE[values.accountRole] || "",
        facility: selectedFacility,
        bhcFacility: isBhcAccount ? values.bhcFacility : "",
        rhuFacility: isBhcAccount || isRhuAccount ? values.rhuFacility : "",
        assignedBarangayHealthCenter: isBhcAccount ? values.bhcFacility : "",
        assignedRuralHealthUnit:
          isBhcAccount || isRhuAccount ? values.rhuFacility : "",
        status: existingUser?.status || "Active",
      };

      if (!isEditMode || values.password) {
        payload.password = values.password;
      }

      if (isEditMode) {
        updateAdminAccount(existingUser.id, payload);
        setSuccessModal({
          title: "Account Updated Successfully",
          message: "The account information has been updated successfully.",
        });
      } else {
        createAdminAccount(payload);
        setSuccessModal({
          title: "Account Added Successfully",
          message: "The new account has been created successfully.",
        });
      }
    },
    {
      fullName: validators.required,
      email: validators.email,
      accountRole: validators.required,
    },
  );

  const selectedAccountRole = getAccountRole(form.values.accountRole);
  const isBhcAccount = form.values.accountRole === "bhc_worker";
  const isRhuAccount = form.values.accountRole === "rhu_staff";

  const pageTitle = isEditMode ? "Edit User Account" : "Add User Account";

  function clearFieldError(name) {
    setStepErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function clearMultipleErrors(names) {
    setStepErrors((prev) => {
      const next = { ...prev };
      names.forEach((name) => delete next[name]);
      return next;
    });
  }

  function handleAccountChange(event) {
    const { name, value } = event.target;

    clearFieldError(name);

    form.setValues((prev) => {
      const next = { ...prev, [name]: value };

      if (name === "bhcFacility" && prev.accountRole === "bhc_worker") {
        next.facility = value;
      }

      if (name === "rhuFacility" && prev.accountRole === "rhu_staff") {
        next.facility = value;
      }

      return next;
    });
  }

  function handleRoleSelect(roleValue) {
    clearMultipleErrors([
      "accountRole",
      "bhcFacility",
      "rhuFacility",
      "facility",
    ]);

    form.setValues((prev) => {
      const isBhc = roleValue === "bhc_worker";
      const isRhu = roleValue === "rhu_staff";
      const safeBhcFacility = BHC_FACILITIES.includes(prev.bhcFacility)
        ? prev.bhcFacility
        : "";
      const safeRhuFacility = RHU_FACILITIES.includes(prev.rhuFacility)
        ? prev.rhuFacility
        : DEFAULT_RHU_FACILITY;

      return {
        ...prev,
        accountRole: roleValue,
        position: POSITION_BY_ACCOUNT_ROLE[roleValue] || "",
        bhcFacility: isBhc ? safeBhcFacility : "",
        rhuFacility: isBhc || isRhu ? safeRhuFacility : "",
        facility: isBhc ? safeBhcFacility : isRhu ? safeRhuFacility : "",
      };
    });
  }

  function getStepOneErrors() {
    const errors = {};

    if (!form.values.fullName?.trim()) {
      errors.fullName = "Full name is required.";
    }

    if (!form.values.email?.trim()) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.values.email)) {
      errors.email = "Enter a valid email address.";
    }

    if (!isEditMode && !form.values.password?.trim()) {
      errors.password = "Password is required.";
    } else if (form.values.password && form.values.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }

    if (!form.values.accountRole) {
      errors.accountRole = "Select a user role.";
    }

    return errors;
  }

  function getStepTwoErrors() {
    const errors = {};

    if (!form.values.accountRole) {
      errors.accountRole = "Select a user role first.";
      return errors;
    }

    if (form.values.accountRole === "bhc_worker") {
      if (!form.values.bhcFacility) {
        errors.bhcFacility = "Assigned Barangay Health Center is required.";
      }

      if (!form.values.rhuFacility) {
        errors.rhuFacility = "Assigned Rural Health Unit is required.";
      }
    }

    if (form.values.accountRole === "rhu_staff") {
      if (!form.values.rhuFacility) {
        errors.rhuFacility = "Assigned Rural Health Unit is required.";
      }
    }

    return errors;
  }

  function handleNextStep() {
    const errors = getStepOneErrors();
    setStepErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setCurrentStep(2);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBackStep() {
    setCurrentStep(1);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleFinalSubmit(event) {
    event.preventDefault();

    const stepOneErrors = getStepOneErrors();
    const stepTwoErrors = getStepTwoErrors();
    const errors = { ...stepOneErrors, ...stepTwoErrors };

    setStepErrors(errors);

    if (Object.keys(stepOneErrors).length > 0) {
      setCurrentStep(1);
      return;
    }

    if (Object.keys(stepTwoErrors).length > 0) {
      setCurrentStep(2);
      return;
    }

    form.handleSubmit(event);
  }

  function getError(name) {
    return stepErrors[name] || form.errors[name];
  }

  return (
    <DashboardLayout role="admin" title={pageTitle}>
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
                {pageTitle}
              </h1>
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-[#6B7280]">
                {isEditMode
                  ? "Update the account profile, role, and facility assignment."
                  : "Create an authorized account for Barangay Health Center or Rural Health Unit staff."}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleFinalSubmit} className="space-y-5 pb-4">
          <StepProgress currentStep={currentStep} />

          {currentStep === 1 && (
            <FormSection
              title="Basic Profile"
              subtitle="Enter identity details and choose the correct system role."
              icon={<UserPlus size={14} />}
              delay={1}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormGroup
                  label="Full Name"
                  error={getError("fullName")}
                  required
                >
                  <Input
                    name="fullName"
                    value={form.values.fullName}
                    onChange={handleAccountChange}
                    placeholder="Example: Maria Divina Santos"
                  />
                </FormGroup>

                <FormGroup
                  label="Email Address"
                  error={getError("email")}
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
                  label={isEditMode ? "New Password" : "Password"}
                  error={getError("password")}
                  required={!isEditMode}
                >
                  <PasswordInput
                    name="password"
                    value={form.values.password}
                    onChange={handleAccountChange}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                    placeholder={
                      isEditMode
                        ? "Leave blank to keep current password"
                        : "Enter account password"
                    }
                  />
                </FormGroup>
              </div>

              <div className="mt-6">
                <div className="mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Select User Role
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    The next step will change based on the selected role.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {ACCOUNT_ROLES.map((role) => (
                    <RoleCard
                      key={role.value}
                      role={role}
                      selected={form.values.accountRole === role.value}
                      onClick={() => handleRoleSelect(role.value)}
                    />
                  ))}
                </div>

                {getError("accountRole") && (
                  <p className="mt-2 text-[11px] font-medium text-red-600">
                    {getError("accountRole")}
                  </p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#B91C1C] px-6 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                >
                  Next
                  <ArrowLeft
                    size={14}
                    strokeWidth={2.5}
                    className="rotate-180"
                  />
                </button>
              </div>
            </FormSection>
          )}

          {currentStep === 2 && (
            <>
              <RoleWorkflowCard
                selectedAccountRole={selectedAccountRole}
                isBhcAccount={isBhcAccount}
                isRhuAccount={isRhuAccount}
              />

              <FormSection
                title={
                  isBhcAccount
                    ? "BHC Facility Assignment"
                    : "RHU Facility Assignment"
                }
                subtitle={
                  isBhcAccount
                    ? "Assign the account to one Barangay Health Center and its connected Rural Health Unit."
                    : "Assign the account to the Rural Health Unit workspace."
                }
                icon={<Building2 size={14} />}
                delay={2}
              >
                {isBhcAccount && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <FormGroup
                      label="Assigned Barangay Health Center"
                      error={getError("bhcFacility")}
                      required
                    >
                      <Select
                        name="bhcFacility"
                        value={form.values.bhcFacility}
                        onChange={handleAccountChange}
                        options={[
                          {
                            value: "",
                            label: "Select Barangay Health Center",
                          },
                          ...BHC_FACILITIES.map((facility) => ({
                            value: facility,
                            label: facility,
                          })),
                        ]}
                      />
                    </FormGroup>

                    <FormGroup
                      label="Connected Rural Health Unit"
                      error={getError("rhuFacility")}
                      required
                    >
                      <Select
                        name="rhuFacility"
                        value={form.values.rhuFacility}
                        onChange={handleAccountChange}
                        options={RHU_FACILITIES.map((facility) => ({
                          value: facility,
                          label: facility,
                        }))}
                      />
                    </FormGroup>
                  </div>
                )}

                {isRhuAccount && (
                  <div className="grid gap-4 lg:grid-cols-1">
                    <FormGroup
                      label="Assigned Rural Health Unit"
                      error={getError("rhuFacility")}
                      required
                    >
                      <Select
                        name="rhuFacility"
                        value={form.values.rhuFacility}
                        onChange={handleAccountChange}
                        options={RHU_FACILITIES.map((facility) => ({
                          value: facility,
                          label: facility,
                        }))}
                      />
                    </FormGroup>
                  </div>
                )}
              </FormSection>

              <AccountSummary
                values={form.values}
                selectedAccountRole={selectedAccountRole}
                isBhcAccount={isBhcAccount}
                isRhuAccount={isRhuAccount}
              />

              <div
                className="anim-fade-up flex items-center justify-between gap-3 pt-1"
                style={stagger(4)}
              >
                <button
                  type="button"
                  onClick={handleBackStep}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB]"
                >
                  <ChevronLeft size={14} strokeWidth={2.5} />
                  Back
                </button>

                <button
                  type="submit"
                  disabled={form.isSubmitting}
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#B91C1C] px-6 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus size={14} strokeWidth={2.5} />
                  {isEditMode ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </>
          )}
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

function StepProgress({ currentStep }) {
  return (
    <div className="anim-fade-up rounded-2xl border border-slate-200/80 bg-white px-6 py-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#B91C1C] transition-all duration-300"
            style={{ width: currentStep === 1 ? "50%" : "100%" }}
          />
        </div>

        <span className="whitespace-nowrap text-[11px] font-semibold text-[#0F172A]">
          Step {currentStep} of 2
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        {currentStep === 1
          ? "Please provide the identity details and select the account role."
          : "Complete the facility assignment based on the selected role."}
      </p>
    </div>
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

function PasswordInput({
  name,
  value,
  onChange,
  showPassword,
  setShowPassword,
  placeholder,
}) {
  return (
    <div className="relative">
      <input
        name={name}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 pr-11 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />

      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-slate-400 transition hover:text-[#B91C1C]"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function RoleCard({ role, selected, onClick }) {
  const Icon = role.value === "bhc_worker" ? Building2 : Hospital;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[86px] items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
        selected
          ? "border-[#B91C1C] bg-[#FEF2F2] shadow-sm"
          : "border-slate-200 bg-white hover:border-[#B91C1C]/40 hover:bg-slate-50"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
          selected
            ? "bg-white text-[#B91C1C]"
            : "bg-slate-100 text-slate-500 group-hover:text-[#B91C1C]"
        }`}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0">
        <p
          className={`text-[13px] font-bold ${
            selected ? "text-[#991B1B]" : "text-slate-900"
          }`}
        >
          {role.label}
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
          {role.subtitle}
        </p>
        <p className="mt-1 text-[10px] text-slate-400">{role.roleLabel}</p>
      </div>
    </button>
  );
}

function RoleWorkflowCard({ selectedAccountRole, isBhcAccount, isRhuAccount }) {
  if (!selectedAccountRole) return null;

  return (
    <section
      className="anim-fade-up rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
      style={stagger(1)}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
            {isBhcAccount ? <Building2 size={18} /> : <Hospital size={18} />}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {selectedAccountRole.workflowTitle}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              {selectedAccountRole.workflowDescription}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[11px] font-bold text-slate-600">
          {isBhcAccount && (
            <>
              <span className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[#B91C1C]">
                BHC
              </span>
              <span className="text-slate-300">→</span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
                RHU
              </span>
            </>
          )}

          {isRhuAccount && (
            <span className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[#B91C1C]">
              RHU Workspace
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function AccountSummary({
  values,
  selectedAccountRole,
  isBhcAccount,
  isRhuAccount,
}) {
  return (
    <section
      className="anim-fade-up rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={stagger(3)}
    >
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-[13px] font-bold text-slate-900">
          Account Summary
        </h2>
        <p className="text-[11px] text-slate-500">
          Confirm the role-based assignment before saving.
        </p>
      </div>

      <div className="p-6">
        <div className="space-y-3">
          <SummaryRow label="Name" value={values.fullName || "Not provided"} />
          <SummaryRow label="Email" value={values.email || "Not provided"} />
          <SummaryRow
            label="Role"
            value={selectedAccountRole?.roleLabel || "Not selected"}
          />

          {isBhcAccount && (
            <SummaryRow
              label="Assigned Barangay Health Center"
              value={values.bhcFacility || "Not selected"}
            />
          )}

          {(isBhcAccount || isRhuAccount) && (
            <SummaryRow
              label={
                isBhcAccount
                  ? "Connected Rural Health Unit"
                  : "Assigned Rural Health Unit"
              }
              value={values.rhuFacility || "Not selected"}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </span>
      <span className="max-w-[60%] text-right text-[12px] font-semibold text-slate-900">
        {value}
      </span>
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

  const isBhcAccount = inferredAccountRole === "bhc_worker";
  const isRhuAccount = inferredAccountRole === "rhu_staff";

  const assignedBhc =
    user?.bhcFacility ||
    user?.assignedBarangayHealthCenter ||
    (isBhcAccount ? user?.facility : "") ||
    "";

  const assignedRhu =
    user?.rhuFacility ||
    user?.assignedRuralHealthUnit ||
    (isRhuAccount ? user?.facility : "") ||
    DEFAULT_RHU_FACILITY;

  return {
    fullName: user?.fullName || user?.name || "",
    email: user?.email || "",
    password: "",
    contactNumber: user?.contactNumber || "",
    accountRole: inferredAccountRole,
    position:
      user?.position || POSITION_BY_ACCOUNT_ROLE[inferredAccountRole] || "",
    facility: isBhcAccount
      ? assignedBhc
      : isRhuAccount
        ? assignedRhu
        : user?.facility || "",
    bhcFacility: assignedBhc,
    rhuFacility:
      isBhcAccount || isRhuAccount ? assignedRhu : DEFAULT_RHU_FACILITY,
  };
}

function getAccountRole(value) {
  return ACCOUNT_ROLES.find((role) => role.value === value) || null;
}

function getAccountRoleFromUser(user) {
  if (!user) return "";

  const roleText = [
    user.accountRole,
    user.accountRoleLabel,
    user.role,
    user.position,
    user.facility,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (roleText.includes("bhc") || roleText.includes("barangay health")) {
    return "bhc_worker";
  }

  if (roleText.includes("rhu") || roleText.includes("rural health")) {
    return "rhu_staff";
  }

  return "";
}
