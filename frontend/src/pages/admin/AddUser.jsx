import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, HandHeart, Hospital, House, Keyboard, ShieldCheck, Stethoscope, Syringe, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Input from "../../components/common/atoms/Input";
import Select from "../../components/common/atoms/Select";
import ConfirmationModal from "../../components/common/modals/ConfirmationModal";
import PermissionMatrix from "../../components/features/access/PermissionMatrix";
import PermissionReviewSummary, { ACCOUNT_CONFIRMATION } from "../../components/features/access/PermissionReviewSummary";
import { apiRequest, unwrapData } from "../../services/apiClient";
import { getBarangayHealthCenters, getRuralHealthUnits } from "../../services/facilityService";
import { getStaffRoles } from "../../services/staffRolesService";
import { reviewPermissions, setPermission, withRequirements } from "../../utils/accessPolicy";
import { TIERS, applyFacilityChange, availableDuties, isValidContactNumber, needsReplaceConfirm, normalizeContactNumber, roleDefaults, roleFor, rolesForTier } from "../../utils/staffRoles";

const empty = { name: "", email: "", contact_number: "", password: "", password_confirmation: "", role: "", staff_role: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: null };
const FACILITY_TYPES = [
  { tier: TIERS.bhc, label: "Barangay Health Center", icon: House },
  { tier: TIERS.rhu, label: "Rural Health Unit", icon: Hospital },
  { tier: TIERS.admin, label: "Municipal Health Officer", icon: ShieldCheck },
];
const ROLE_ICONS = { midwife: Stethoscope, bhw: HandHeart, encoder: Keyboard, nurse: Syringe, doctor: UserRound };
const panel = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4";
const button = "rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40";
const card = selected => `flex items-center gap-3 rounded-xl border p-4 text-left text-sm font-semibold transition ${selected ? "border-red-600 bg-red-50 text-red-800" : "border-slate-200 text-slate-800 hover:border-slate-300"}`;

export default function AddUser() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("userId");
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState(0);
  const [rolesData, setRolesData] = useState(null);
  const [facilities, setFacilities] = useState({ bhc: [], rhu: [] });
  const [originalTier, setOriginalTier] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const admin = form.role === TIERS.admin;
  const reviewLabel = id ? "Review & Save" : "Review & Create";
  const steps = admin ? ["Facility", "Personal Details", reviewLabel] : ["Facility", "Personal Details", "Role & Access", reviewLabel];
  const current = steps[step];
  const last = step === steps.length - 1;
  const tierFacilities = (form.role === TIERS.bhc ? facilities.bhc : form.role === TIERS.rhu ? facilities.rhu : []).filter(f => !f.status || f.status === "active");
  const facilityId = form.role === TIERS.bhc ? form.barangay_health_center_id : form.rural_health_unit_id;
  const home = tierFacilities.find(f => String(f.id) === String(facilityId));
  const role = roleFor(rolesData, form.staff_role);
  const defaults = roleDefaults(rolesData, form.staff_role);
  const review = reviewPermissions({ permissions: form.permissions, defaults, licensedRole: Boolean(role?.licensed) });

  useEffect(() => {
    let active = true;
    Promise.all([getBarangayHealthCenters(), getRuralHealthUnits(), getStaffRoles(), id ? apiRequest(`/users/${id}`) : null]).then(([bhc, rhu, roles, response]) => {
      if (!active) return;
      setFacilities({ bhc, rhu });
      setRolesData(roles);
      if (response) {
        const u = unwrapData(response);
        // Accounts saved before roles existed hold no role; Role & Access asks for one before saving.
        const permissions = withRequirements(u.permissions ?? roleDefaults(roles, u.staff_role));
        setForm({ ...empty, name: u.name, email: u.email, contact_number: u.contact_number || "", role: u.role, staff_role: u.staff_role || "", permissions, barangay_health_center_id: u.barangay_health_center_id, rural_health_unit_id: u.rural_health_unit_id });
        setOriginalTier(u.role);
      }
      setLoaded(true);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);

  function change(key, value) { setForm(f => ({ ...f, [key]: value })); }

  function chooseTier(tier) {
    if (tier === form.role) return;
    const apply = () => { setForm(f => applyFacilityChange(f, tier, null)); setConfirmed(false); };
    // Editing an existing account to another tier discards its role and duties, so ask first.
    if (id && originalTier && form.role) {
      setPending({ title: "Change facility type?", description: "Changing the facility type will clear this account's role and access. Continue?", confirmText: "Change", apply });
    } else apply();
  }

  function chooseFacility(value) { setForm(f => applyFacilityChange(f, f.role, value ? Number(value) : null)); setConfirmed(false); }

  function chooseRole(key) {
    if (key === form.staff_role) return;
    const apply = () => { setForm(f => ({ ...f, staff_role: key, permissions: roleDefaults(rolesData, key) })); setConfirmed(false); };
    if (needsReplaceConfirm(rolesData, form.staff_role, form.permissions)) {
      setPending({ title: "Replace access?", description: `Replace current access with ${roleFor(rolesData, key).label} defaults?`, confirmText: "Replace", apply });
    } else apply();
  }

  function changeAccess(key, on) { setForm(f => ({ ...f, permissions: setPermission(f.permissions, key, on) })); setConfirmed(false); }

  function validate() {
    if (current === "Facility") {
      if (!form.role) return "Choose where this account will work.";
      if (form.role === TIERS.bhc && !home) return "Choose the Barangay Health Center.";
      if (form.role === TIERS.rhu && !home) return "Choose the Rural Health Unit.";
    }
    if (current === "Personal Details") {
      if (!form.name.trim()) return "Enter the full name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email address.";
      if (!isValidContactNumber(form.contact_number)) return "Enter a mobile number like 09171234567.";
      if ((!id || form.password) && form.password.length < 8) return "Password must contain at least 8 characters.";
      if ((!id || form.password) && form.password !== form.password_confirmation) return "Passwords do not match.";
    }
    if (current === "Role & Access") {
      if (!form.staff_role) return "Choose a role.";
      if (!form.permissions.length) return "Select at least one duty.";
    }
    if (last && !confirmed) return "Tick the confirmation before saving.";
    return "";
  }

  async function next(e) {
    e.preventDefault();
    const invalid = validate();
    setError(invalid);
    if (invalid) return;
    if (!last) { setStep(s => s + 1); return; }
    setBusy(true);
    const body = {
      name: form.name.trim(), email: form.email, contact_number: normalizeContactNumber(form.contact_number), role: form.role,
      staff_role: admin ? null : form.staff_role, permissions: admin ? [] : form.permissions, permissions_confirmed: true,
      barangay_health_center_id: form.barangay_health_center_id, rural_health_unit_id: form.rural_health_unit_id,
    };
    if (form.password) Object.assign(body, { password: form.password, password_confirmation: form.password_confirmation });
    try { await apiRequest(id ? `/users/${id}` : "/users", { method: id ? "PATCH" : "POST", body }); navigate("/admin/users"); }
    catch (e) { setError(Object.values(e.errors || {}).flat().join(" ") || e.message); }
    finally { setBusy(false); }
  }

  const details = [
    ["Facility", admin ? "Municipal Health Officer (not tied to a facility)" : home?.name],
    ["Name", form.name], ["Email", form.email], ["Contact number", normalizeContactNumber(form.contact_number)],
    ["Role", admin ? "Municipal Health Officer" : role?.label],
    ["Credentials", form.password ? "Password set (hidden)" : "Existing password retained"],
  ];
  const passwordType = showPassword ? "text" : "password";

  return <DashboardLayout role="admin" title={id ? "Edit User Account" : "Create Account"}><form onSubmit={next} className="mx-auto max-w-4xl space-y-5 pb-8">
    <button type="button" className="text-sm text-red-700" onClick={() => navigate("/admin/users")}>← Account Directory</button>
    <ol aria-label="Account setup progress" className="flex flex-wrap gap-2">{steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3 py-2 text-xs font-semibold ${i === step ? "bg-red-700 text-white" : i < step ? "bg-red-50 text-red-700" : "bg-white text-slate-500"}`}>{i + 1}. {label}</li>)}</ol>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className={panel}><h1 className="text-lg font-bold">{current}</h1>

    {current === "Facility" && <>
      <p className="text-sm text-slate-500">Where will this account work?</p>
      <div className="grid gap-3 sm:grid-cols-3">{FACILITY_TYPES.map(({ tier, label, icon: Icon }) => (
        <button key={tier} type="button" aria-pressed={form.role === tier} onClick={() => chooseTier(tier)} className={`${card(form.role === tier)} flex-col items-start py-6`}>
          <Icon size={22} aria-hidden="true" className="text-red-700" />{label}
        </button>
      ))}</div>
      {(form.role === TIERS.bhc || form.role === TIERS.rhu) && (
        <label className="block text-sm">{form.role === TIERS.bhc ? "Which Barangay Health Center?" : "Which Rural Health Unit?"}
          <Select placeholder="Select facility" value={home ? String(home.id) : ""} onChange={e => chooseFacility(e.target.value)} options={tierFacilities.map(f => ({ value: String(f.id), label: f.name }))}/>
        </label>
      )}
      {admin && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Municipal Health Officer accounts are not tied to a facility.</p>}
    </>}

    {current === "Personal Details" && <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Full name<Input value={form.name} onChange={e => change("name", e.target.value)}/></label>
      <label className="text-sm">Email<Input type="email" value={form.email} onChange={e => change("email", e.target.value)}/></label>
      <label className="text-sm">Contact number<Input type="tel" inputMode="numeric" placeholder="09XX XXX XXXX" value={form.contact_number} onChange={e => change("contact_number", e.target.value)}/></label>
      <div className="hidden sm:block"/>
      <label className="text-sm">{id ? "New password (optional)" : "Password"}<Input type={passwordType} autoComplete="new-password" value={form.password} onChange={e => change("password", e.target.value)}/></label>
      <label className="text-sm">Confirm password<Input type={passwordType} autoComplete="new-password" value={form.password_confirmation} onChange={e => change("password_confirmation", e.target.value)}/></label>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        {id ? <p className="text-xs text-slate-500">Leave blank to keep the current password.</p> : <span/>}
        <button type="button" onClick={() => setShowPassword(s => !s)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          {showPassword ? <EyeOff size={14} aria-hidden="true"/> : <Eye size={14} aria-hidden="true"/>}{showPassword ? "Hide passwords" : "Show passwords"}
        </button>
      </div>
    </div>}

    {current === "Role & Access" && <>
      <div role="group" aria-label="Role" className="grid gap-3 sm:grid-cols-3">{rolesForTier(rolesData, form.role).map(r => {
        const Icon = ROLE_ICONS[r.key] || UserRound;
        return <button key={r.key} type="button" aria-pressed={form.staff_role === r.key} onClick={() => chooseRole(r.key)} className={card(form.staff_role === r.key)}><Icon size={18} aria-hidden="true" className="text-red-700"/>{r.label}</button>;
      })}</div>
      {form.staff_role
        ? <PermissionMatrix permissions={form.permissions} available={availableDuties(rolesData, form.role)} defaults={defaults} licensedRole={Boolean(role?.licensed)} onChange={changeAccess} onReset={() => { setForm(f => ({ ...f, permissions: defaults })); setConfirmed(false); }}/>
        : <p className="text-sm text-slate-500">Choose a role to see its access.</p>}
    </>}

    {last && <PermissionReviewSummary review={admin ? null : review} details={details} confirmed={confirmed} onConfirm={setConfirmed} confirmationLabel={ACCOUNT_CONFIRMATION}/>}
    </section>

    <div className="flex justify-between"><button type="button" disabled={!step || busy} onClick={() => { setStep(s => s - 1); setError(""); }} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm disabled:opacity-40">Back</button><button type="submit" disabled={busy || !loaded || (last && !confirmed)} className={button}>{busy ? "Saving…" : last ? id ? "Save Changes" : "Create Account" : "Continue"}</button></div>
    <ConfirmationModal open={Boolean(pending)} title={pending?.title} description={pending?.description} confirmText={pending?.confirmText} onCancel={() => setPending(null)} onConfirm={() => { pending.apply(); setPending(null); }}/>
  </form></DashboardLayout>;
}
