  import { useEffect, useMemo, useState } from "react";
  import { useNavigate, useSearchParams } from "react-router";
  import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Building2,
    Check,
    CheckCircle2,
    ChevronLeft,
    Eye,
    EyeOff,
    Hospital,
    Info,
    Loader2,
    LockKeyhole,
    Mail,
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
    refreshAdminAccounts,
    updateAdminAccount,
  } from "../../services/adminAccountsService";
  import {
    getBarangayHealthCenters,
    getRuralHealthUnits,
  } from "../../services/facilityService";

  import { validators } from "../../utils/validators";

  const ACCOUNT_ROLES = [
    {
      value: "bhc_worker",
      label: "BHC Account",
      roleLabel: "Barangay Health Center Worker",
      subtitle: "Barangay Health Center",
      accessRole: "BHC",
      workflowDescription:
        "This account can encode BHC patients, create health records, and send referrals to the assigned Rural Health Unit.",
    },
    {
      value: "rhu_staff",
      label: "RHU Account",
      roleLabel: "Rural Health Unit Staff",
      subtitle: "Rural Health Unit",
      accessRole: "RHU",
      workflowDescription:
        "This account can receive referrals, check in patients, manage RHU records, and submit feedback/return slips.",
    },
    {
      value: "admin",
      label: "Admin Account",
      roleLabel: "Municipal Health Office Administrator",
      subtitle: "System Administration",
      accessRole: "Admin",
      workflowDescription:
        "This account can manage users, facilities, reports, and administrative system records without a clinical facility assignment.",
    },
  ];

  const POSITION_BY_ACCOUNT_ROLE = {
    bhc_worker: "Barangay Health Worker",
    rhu_staff: "RHU Staff",
    admin: "Municipal Health Officer",
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
    const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);
    const [successModal, setSuccessModal] = useState(null);
    const [accounts, setAccounts] = useState(() => getAdminAccounts());
    const [facilities, setFacilities] = useState({ bhcs: [], rhus: [] });
    const [facilityError, setFacilityError] = useState("");
    const [submissionError, setSubmissionError] = useState("");

    const mode = searchParams.get("mode");
    const userId = searchParams.get("userId");

    const existingUser = useMemo(() => {
      if (!userId) return null;
      return accounts.find((account) => account.id === userId) || null;
    }, [accounts, userId]);

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
          rhuFacility: isRhuAccount ? values.rhuFacility : "",
          barangayHealthCenterId: isBhcAccount
            ? values.bhcFacilityId
            : null,
          ruralHealthUnitId: isRhuAccount ? values.rhuFacilityId : null,
          assignedBarangayHealthCenter: isBhcAccount ? values.bhcFacility : "",
          assignedRuralHealthUnit: isRhuAccount ? values.rhuFacility : "",
          status: existingUser?.status || "Active",
        };

        if (!isEditMode || values.password) {
          payload.password = values.password;
        }

        try {
          setSubmissionError("");

          if (isEditMode) {
            await updateAdminAccount(existingUser.id, payload);
            setConfirmationModalOpen(false);
            setSuccessModal({
              title: "Changes saved.",
              message: "The account information has been updated successfully.",
            });
          } else {
            await createAdminAccount(payload);
            setConfirmationModalOpen(false);
            setSuccessModal({
              title: "User added.",
              message: "The new account has been created successfully.",
            });
          }
        } catch (error) {
          const backendErrors = getBackendFormErrors(error);
          const errorMessage = getSubmissionErrorMessage(error, backendErrors);

          form.setErrors((previous) => ({ ...previous, ...backendErrors }));
          setStepErrors((previous) => ({ ...previous, ...backendErrors }));
          setSubmissionError(errorMessage);
          setConfirmationModalOpen(false);

          if (
            Object.keys(backendErrors).some((field) =>
              ["fullName", "email", "password", "accountRole"].includes(field),
            )
          ) {
            setCurrentStep(1);
          } else {
            setCurrentStep(2);
          }
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
    const isAdminAccount = form.values.accountRole === "admin";

    const bhcFacilityOptions = useMemo(
      () =>
        facilities.bhcs.map((facility) => ({
          value: facility.id,
          label: facility.name,
        })),
      [facilities.bhcs],
    );

    const rhuFacilityOptions = useMemo(
      () =>
        facilities.rhus.map((facility) => ({
          value: facility.id,
          label: facility.name,
        })),
      [facilities.rhus],
    );

    const pageTitle = isEditMode ? "Edit User Account" : "Add User Account";

    useEffect(() => {
      let active = true;

      refreshAdminAccounts().then((items) => {
        if (active) setAccounts(Array.isArray(items) ? items : []);
      });

      Promise.all([getBarangayHealthCenters(), getRuralHealthUnits()])
        .then(([bhcs, rhus]) => {
          if (!active) return;

          setFacilities({
            bhcs: Array.isArray(bhcs) ? bhcs : [],
            rhus: Array.isArray(rhus) ? rhus : [],
          });
          setFacilityError("");
        })
        .catch((error) => {
          if (!active) return;

          setFacilities({ bhcs: [], rhus: [] });
          setFacilityError(error?.message || "Unable to load facilities.");
        });

      return () => {
        active = false;
      };
    }, []);

    useEffect(() => {
      if (existingUser) {
        form.setValues(getInitialValues(existingUser));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingUser]);

    function clearFieldError(name) {
      setSubmissionError("");
      setStepErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      form.setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }

    function clearMultipleErrors(names) {
      setSubmissionError("");
      setStepErrors((prev) => {
        const next = { ...prev };
        names.forEach((name) => delete next[name]);
        return next;
      });
      form.setErrors((prev) => {
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

        if (name === "bhcFacilityId") {
          const facility = facilities.bhcs.find((item) => item.id === value);
          next.bhcFacility = facility?.name || "";

          if (prev.accountRole === "bhc_worker") {
            next.facility = facility?.name || "";
          }
        }

        if (name === "rhuFacilityId") {
          const facility = facilities.rhus.find((item) => item.id === value);
          next.rhuFacility = facility?.name || "";

          if (prev.accountRole === "rhu_staff") {
            next.facility = facility?.name || "";
          }
        }

        return next;
      });
    }

    function handleRoleSelect(roleValue) {
      clearMultipleErrors([
        "accountRole",
        "bhcFacility",
        "bhcFacilityId",
        "rhuFacility",
        "rhuFacilityId",
        "facility",
      ]);

      form.setValues((prev) => {
        const isBhc = roleValue === "bhc_worker";
        const isRhu = roleValue === "rhu_staff";

        const safeBhcId = facilities.bhcs.some(
          (facility) => facility.id === prev.bhcFacilityId,
        )
          ? prev.bhcFacilityId
          : "";

        const safeRhuId = facilities.rhus.some(
          (facility) => facility.id === prev.rhuFacilityId,
        )
          ? prev.rhuFacilityId
          : "";

        const safeBhcFacility =
          facilities.bhcs.find((facility) => facility.id === safeBhcId)?.name ||
          "";

        const safeRhuFacility =
          facilities.rhus.find((facility) => facility.id === safeRhuId)?.name ||
          "";

        return {
          ...prev,
          accountRole: roleValue,
          position: POSITION_BY_ACCOUNT_ROLE[roleValue] || "",
          bhcFacilityId: isBhc ? safeBhcId : "",
          rhuFacilityId: isRhu ? safeRhuId : "",
          bhcFacility: isBhc ? safeBhcFacility : "",
          rhuFacility: isRhu ? safeRhuFacility : "",
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
      } else if (form.values.password && form.values.password.length < 8) {
        errors.password = "Password must be at least 8 characters.";
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
        if (!form.values.bhcFacilityId) {
          errors.bhcFacilityId = "Assigned Barangay Health Center is required.";
        }
      }

      if (form.values.accountRole === "rhu_staff") {
        if (!form.values.rhuFacilityId) {
          errors.rhuFacilityId = "Assigned Rural Health Unit is required.";
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

      setConfirmationModalOpen(true);
    }

    async function handleConfirmSubmit() {
      await form.handleSubmit();
    }

    function getError(name) {
      return stepErrors[name] || form.errors[name];
    }

    return (
      <DashboardLayout role="admin" title={pageTitle}>
        <style>{keyframes}</style>

        <div className="mx-auto max-w-5xl pb-6">
          <div className="anim-fade-up mb-6" style={stagger(0)}>
            <button
              type="button"
              onClick={() => navigate("/admin/users")}
              className="mb-4 inline-flex items-center gap-2 text-[12px] font-semibold text-[#64748B] transition-colors duration-200 hover:text-[#B91C1C]"
            >
              <ArrowLeft size={15} />
              Back to Account Directory
            </button>

            <div className="px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl">
                    {pageTitle}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6B7280]">
                    {isEditMode
                      ? "Update the account profile, role, and facility assignment."
                      : "Create an authorized BHC, RHU, or administrative account."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleFinalSubmit} className="space-y-5 pb-4">
            {submissionError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-red-100 bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
              >
                <AlertCircle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <p className="font-semibold">Unable to save this account.</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#B91C1C]">
                    {submissionError}
                  </p>
                </div>
              </div>
            )}
            {currentStep === 1 && (
              <FormSection
                title="Basic Profile"
                subtitle="Enter identity details and choose the correct system role."
                delay={1}
              >
                <div className="grid gap-5 md:grid-cols-2">
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
                      className="h-11 bg-white shadow-sm"
                    />
                    <FieldNote icon={<UserPlus size={13} />}>
                      Use the staff member's complete display name.
                    </FieldNote>
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
                      className="h-11 bg-white shadow-sm"
                    />
                    <FieldNote icon={<Mail size={13} />}>
                      This email is saved with the account profile.
                    </FieldNote>
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
                    <FieldNote icon={<LockKeyhole size={13} />}>
                      {isEditMode
                        ? "Leave blank unless the account password should change."
                        : "Use at least 8 characters for the account password."}
                    </FieldNote>
                  </FormGroup>
                </div>

                <div className="mt-7 border-t border-slate-100 pt-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        Select User Role <span className="text-[#B91C1C]">*</span>
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                        Choose the role that matches the account's facility
                        workflow.
                      </p>
                    </div>

                    {selectedAccountRole && (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-red-100 bg-[#FEF2F2] px-3 py-1 text-[11px] font-bold text-[#991B1B]">
                        <Check size={13} />
                        {selectedAccountRole.accessRole} selected
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

                <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => navigate("/admin/users")}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#0F172A]"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
                  >
                    Next
                    <ArrowRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </FormSection>
            )}

            {currentStep === 2 && (
              <>
                <FormSection
                  title={
                    isBhcAccount
                      ? "BHC Facility Assignment"
                      : isRhuAccount
                        ? "RHU Facility Assignment"
                        : "Administrative Access"
                  }
                  subtitle={
                    isBhcAccount
                      ? "Assign the account to one Barangay Health Center."
                      : isRhuAccount
                        ? "Assign the account to the Rural Health Unit workspace."
                        : "Administrative accounts do not require a clinical facility assignment."
                  }
                  icon={
                    isAdminAccount ? (
                      <ShieldCheck size={14} />
                    ) : (
                      <Building2 size={14} />
                    )
                  }
                  delay={1}
                >
                  {facilityError && (
                    <FacilityNotice tone="error">{facilityError}</FacilityNotice>
                  )}

                  {isBhcAccount && (
                    <div className="max-w-2xl">
                      <div>
                        <FormGroup
                          label="Assigned Barangay Health Center"
                          error={getError("bhcFacilityId")}
                          required
                        >
                          <Select
                            name="bhcFacilityId"
                            value={form.values.bhcFacilityId}
                            onChange={handleAccountChange}
                            className="h-11 bg-white shadow-sm"
                            options={[
                              {
                                value: "",
                                label: "Select Barangay Health Center",
                              },
                              ...bhcFacilityOptions,
                            ]}
                          />
                          <FieldNote icon={<Building2 size={13} />}>
                            The selected BHC is stored as the account's assigned
                            barangay health center.
                          </FieldNote>
                        </FormGroup>

                        {bhcFacilityOptions.length === 0 && !facilityError && (
                          <FacilityNotice>
                            No Barangay Health Center facilities are available.
                          </FacilityNotice>
                        )}
                      </div>

                    </div>
                  )}

                  {isRhuAccount && (
                    <div className="max-w-2xl">
                      <FormGroup
                        label="Assigned Rural Health Unit"
                        error={getError("rhuFacilityId")}
                        required
                      >
                        <Select
                          name="rhuFacilityId"
                          value={form.values.rhuFacilityId}
                          onChange={handleAccountChange}
                          className="h-11 bg-white shadow-sm"
                          options={[
                            {
                              value: "",
                              label: "Select Rural Health Unit",
                            },
                            ...rhuFacilityOptions,
                          ]}
                        />
                        <FieldNote icon={<Hospital size={13} />}>
                          The selected RHU becomes this staff account's workspace.
                        </FieldNote>
                      </FormGroup>

                      {rhuFacilityOptions.length === 0 && !facilityError && (
                        <FacilityNotice>
                          No Rural Health Unit facilities are available.
                        </FacilityNotice>
                      )}
                    </div>
                  )}

                  {isAdminAccount && (
                    <FacilityNotice>
                      This account will be saved without a BHC or RHU assignment.
                    </FacilityNotice>
                  )}
                </FormSection>

                <div
                  className="anim-fade-up flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"
                  style={stagger(2)}
                >
                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => navigate("/admin/users")}
                      className="inline-flex h-11 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#0F172A]"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleBackStep}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#0F172A]"
                    >
                      <ChevronLeft size={14} strokeWidth={2.5} />
                      Back
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={form.isSubmitting}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-6 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {form.isSubmitting ? (
                      <Loader2
                        size={14}
                        strokeWidth={2.5}
                        className="animate-spin"
                      />
                    ) : (
                      <UserPlus size={14} strokeWidth={2.5} />
                    )}

                    {form.isSubmitting
                      ? isEditMode
                        ? "Saving..."
                        : "Creating..."
                      : isEditMode
                        ? "Save Changes"
                        : "Create Account"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        {confirmationModalOpen && (
          <AccountConfirmationModal
            values={form.values}
            selectedAccountRole={selectedAccountRole}
            isBhcAccount={isBhcAccount}
            isRhuAccount={isRhuAccount}
            isAdminAccount={isAdminAccount}
            isEditMode={isEditMode}
            isSubmitting={form.isSubmitting}
            onCancel={() => setConfirmationModalOpen(false)}
            onConfirm={handleConfirmSubmit}
          />
        )}

        {successModal && (
          <SuccessModal
            modal={successModal}
            onClose={() => navigate("/admin/users")}
          />
        )}
      </DashboardLayout>
    );
  }

function FormSection({ title, subtitle, icon, aside, children, delay = 0 }) {
  return (
    <section
      className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-[0_18px_45px_-34px_rgba(15,23,42,0.45)]"
      style={stagger(delay)}
    >
      <div className="bg-white px-5 pt-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C] ring-1 ring-red-100">
                {icon}
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
              {subtitle && (
                <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-slate-500">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      </div>

      <div className="p-5 pt-4 sm:p-6 sm:pt-4">{children}</div>
    </section>
  );
}

  function FieldNote({ icon, children }) {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
        <span className="mt-0.5 text-slate-400">{icon}</span>
        <span>{children}</span>
      </p>
    );
  }

  function FacilityNotice({ children, tone = "default" }) {
    const isError = tone === "error";

    return (
      <div
        className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-medium leading-relaxed ${
          isError
            ? "border-red-100 bg-red-50/80 text-[#991B1B]"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {isError ? (
          <AlertCircle className="mt-0.5 shrink-0" size={15} />
        ) : (
          <Info className="mt-0.5 shrink-0 text-slate-400" size={15} />
        )}
        <span>{children}</span>
      </div>
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
          className="h-11 w-full rounded-lg border border-[#E5E7EB] bg-white px-3 pr-11 text-sm text-[#111827] shadow-sm outline-none transition placeholder:text-[#9CA3AF] hover:border-[#CBD5E1] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
        />

        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    );
  }

  function RoleCard({ role, selected, onClick }) {
    const Icon =
      role.value === "bhc_worker"
        ? Building2
        : role.value === "rhu_staff"
          ? Hospital
          : ShieldCheck;

    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`group relative flex min-h-[154px] items-start gap-4 overflow-hidden rounded-xl border px-5 py-5 text-left transition-all duration-200 ${
          selected
            ? "border-[#B91C1C] bg-[#FEF2F2] shadow-[0_18px_35px_-28px_rgba(185,28,28,0.8)] ring-2 ring-[#B91C1C]/10"
            : "border-slate-200 bg-white hover:border-[#B91C1C]/40 hover:bg-slate-50 hover:shadow-sm"
        }`}
      >
        <span
          className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
            selected
              ? "border-[#B91C1C] bg-[#B91C1C] text-white"
              : "border-slate-200 bg-white text-transparent group-hover:text-slate-300"
          }`}
        >
          <Check size={14} strokeWidth={3} />
        </span>

        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
            selected
              ? "bg-white text-[#B91C1C] shadow-sm"
              : "bg-slate-100 text-slate-500 group-hover:text-[#B91C1C]"
          }`}
        >
          <Icon size={19} />
        </div>

        <div className="min-w-0 pr-7">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-sm font-bold ${
                selected ? "text-[#991B1B]" : "text-slate-900"
              }`}
            >
              {role.label}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                selected
                  ? "border-red-100 bg-white text-[#991B1B]"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {role.accessRole}
            </span>
          </div>

          <p className="mt-1 text-[12px] font-semibold text-slate-600">
            {role.roleLabel}
          </p>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            {role.workflowDescription}
          </p>
        </div>
      </button>
    );
  }

  function AccountConfirmationModal({
    values,
    selectedAccountRole,
    isBhcAccount,
    isRhuAccount,
    isAdminAccount,
    isEditMode,
    isSubmitting,
    onCancel,
    onConfirm,
  }) {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
            <h2 className="text-base font-bold text-slate-900">
              Confirm Account Details
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              Review the account profile and facility assignment before saving.
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-2">
              <SummaryRow
                label="Name"
                value={values.fullName}
                fallback="Pending selection"
              />
              <SummaryRow
                label="Email"
                value={values.email}
                fallback="Pending selection"
              />
              <SummaryRow
                label="Role"
                value={selectedAccountRole?.roleLabel}
                fallback="Not selected"
                badge={selectedAccountRole?.accessRole}
              />

              {isBhcAccount && (
                <SummaryRow
                  label="Assigned Barangay Health Center"
                  value={values.bhcFacility}
                  fallback="Not selected"
                />
              )}

              {isRhuAccount && (
                <SummaryRow
                  label="Assigned Rural Health Unit"
                  value={values.rhuFacility}
                  fallback="Not selected"
                />
              )}

              {isAdminAccount && (
                <SummaryRow
                  label="Facility Assignment"
                  value="No facility assignment"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8ECF0] bg-white px-5 text-[12px] font-semibold text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              {isSubmitting && (
                <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
              )}
              {isEditMode ? "Confirm Changes" : "Confirm Create Account"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function SummaryRow({ label, value, fallback = "Pending selection", badge }) {
    const hasValue =
      typeof value === "string" ? value.trim().length > 0 : Boolean(value);
    const displayValue = hasValue ? value : fallback;

    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
          {label}
        </span>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {badge && (
            <span className="rounded-full border border-red-100 bg-white px-2 py-0.5 text-[10px] font-bold text-[#991B1B]">
              {badge}
            </span>
          )}

          <span
            className={`text-[13px] font-semibold ${
              hasValue ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {displayValue}
          </span>
        </div>
      </div>
    );
  }

  function SuccessModal({ modal, onClose }) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
          <div className="px-6 py-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
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
              className="w-full rounded-lg bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/20"
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
      "";

    return {
      fullName: user?.fullName || user?.name || "",
      email: user?.email || "",
      password: "",
      contactNumber: user?.contactNumber || "",
      accountRole: inferredAccountRole,
      position:
        user?.position || POSITION_BY_ACCOUNT_ROLE[inferredAccountRole] || "",
      bhcFacilityId: isBhcAccount
        ? user?.barangayHealthCenterId || user?.bhcId || ""
        : "",
      rhuFacilityId: isRhuAccount
        ? user?.ruralHealthUnitId || user?.rhuId || ""
        : "",
      facility: isBhcAccount
        ? assignedBhc
        : isRhuAccount
          ? assignedRhu
          : "",
      bhcFacility: isBhcAccount ? assignedBhc : "",
      rhuFacility: isRhuAccount ? assignedRhu : "",
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

    if (
      roleText.includes("admin") ||
      roleText.includes("municipal health officer") ||
      roleText.includes("mho")
    ) {
      return "admin";
    }

    if (roleText.includes("bhc") || roleText.includes("barangay health")) {
      return "bhc_worker";
    }

    if (roleText.includes("rhu") || roleText.includes("rural health")) {
      return "rhu_staff";
    }

    return "";
  }

  const BACKEND_ACCOUNT_FIELD_MAP = {
    name: "fullName",
    email: "email",
    password: "password",
    role: "accountRole",
    barangay_health_center_id: "bhcFacilityId",
    rural_health_unit_id: "rhuFacilityId",
  };

  function getBackendFormErrors(error) {
    return Object.entries(error?.errors || {}).reduce(
      (mappedErrors, [backendField, messages]) => {
        const formField = BACKEND_ACCOUNT_FIELD_MAP[backendField];
        const message = Array.isArray(messages) ? messages[0] : messages;

        if (formField && message) {
          mappedErrors[formField] = String(message);
        }

        return mappedErrors;
      },
      {},
    );
  }

  function getSubmissionErrorMessage(error, backendErrors) {
    const firstBackendMessage = Object.values(error?.errors || {})
      .flat()
      .find(Boolean);

    return String(
      firstBackendMessage ||
        Object.values(backendErrors)[0] ||
        error?.message ||
        "Unable to save this account. Please review the form and try again.",
    );
  }
