import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { HandHeart, Hospital, House, Keyboard, ShieldCheck, Stethoscope, Syringe, UserRound } from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Input from "../../components/common/atoms/Input";
import ConfirmationModal from "../../components/common/modals/ConfirmationModal";
import NoticeModal from "../../components/common/modals/NoticeModal";
import AccountStepper, { STEPPER_HEIGHT } from "../../components/features/access/AccountStepper";
import Field, { FieldMessage } from "../../components/features/access/FieldError";
import FacilityPickerModal from "../../components/features/access/FacilityPickerModal";
import PermissionMatrix from "../../components/features/access/PermissionMatrix";
import PermissionReviewSummary, { ACCOUNT_CONFIRMATION } from "../../components/features/access/PermissionReviewSummary";
import { apiRequest, unwrapData } from "../../services/apiClient";
import { getBarangayHealthCenters, getRuralHealthUnits } from "../../services/facilityService";
import { getStaffRoles } from "../../services/staffRolesService";
import { STEPS, isValidEmail, routeServerErrors, validateAccountStep } from "../../utils/accountForm";
import { fieldState } from "../../utils/fieldState";
import { reviewPermissions, setPermission, withRequirements } from "../../utils/accessPolicy";
import { TIERS, applyFacilityChange, availableDuties, defaultRoleKey, normalizeContactNumber, needsReplaceConfirm, roleDefaults, roleFor, rolesForTier } from "../../utils/staffRoles";

const empty = { name: "", email: "", contact_number: "", role: "", staff_role: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: null };
const FACILITY_TYPES = [
  { tier: TIERS.bhc, label: "Barangay Health Center", icon: House, description: "Barangay-level staff who register patients, record consultations and refer to the RHU." },
  { tier: TIERS.rhu, label: "Rural Health Unit", icon: Hospital, description: "Municipal clinic staff who receive referrals, confirm conditions and manage doctor availability." },
  { tier: TIERS.admin, label: "Municipal Health Officer", icon: ShieldCheck, description: "Administrator. Manages facilities, accounts and reports. Not tied to a facility." },
];
const ROLE_ICONS = { midwife: Stethoscope, bhw: HandHeart, encoder: Keyboard, nurse: Syringe, doctor: UserRound };
const HEADINGS = {
  [STEPS.facility]: ["Where will this account work?", "Choose the facility type, then the facility."],
  [STEPS.personal]: ["Personal details", "How this person can be reached."],
  [STEPS.access]: ["Role & access", "Pick a role, then adjust what this account can do."],
  [STEPS.review]: ["Review", "Check everything before saving."],
};
const card = selected => `flex min-h-24 items-center gap-3 rounded-xl border p-4 text-left text-sm font-semibold transition ${selected ? "border-red-600 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"}`;
const facilityCard = selected => `flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center text-sm font-semibold transition md:min-h-[260px] ${selected ? "border-red-600 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"}`;
const EMAIL_TAKEN = "Email is already taken.";
const pulse = "animate-pulse rounded bg-slate-200 motion-reduce:animate-none";

export default function AddUser() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("userId");
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [rolesData, setRolesData] = useState(null);
  const [facilities, setFacilities] = useState({ bhc: [], rhu: [] });
  const [originalTier, setOriginalTier] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(null);
  const [picker, setPicker] = useState(null);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState({});
  const [takenEmails, setTakenEmails] = useState({});
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailChecks = useRef(new Map());

  const admin = form.role === TIERS.admin;
  const keys = admin ? [STEPS.facility, STEPS.personal, STEPS.review] : [STEPS.facility, STEPS.personal, STEPS.access, STEPS.review];
  const labels = keys.map(key => key === STEPS.review ? (id ? "Review & Save" : "Review & Create") : key);
  const current = keys[step];
  const last = step === keys.length - 1;
  const activeIn = list => list.filter(f => !f.status || f.status === "active");
  const tierFacilities = activeIn(form.role === TIERS.bhc ? facilities.bhc : form.role === TIERS.rhu ? facilities.rhu : []);
  const facilityId = form.role === TIERS.bhc ? form.barangay_health_center_id : form.rural_health_unit_id;
  const home = tierFacilities.find(f => String(f.id) === String(facilityId));
  const homeName = (home || [...facilities.bhc, ...facilities.rhu].find(f => String(f.id) === String(facilityId)))?.name;
  const role = roleFor(rolesData, form.staff_role);
  const defaults = roleDefaults(rolesData, form.staff_role);
  const review = reviewPermissions({ permissions: form.permissions, defaults, licensedRole: Boolean(role?.licensed) });
  const editLoading = Boolean(id) && !loaded;

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
    }).catch(e => { if (active) setNotice({ title: "Could not load the form", messages: [e.message] }); });
    return () => { active = false; };
  }, [id]);

  // A new account opens Role & Access on the first role of its tier, so there is nothing to click before reviewing the duties.
  useEffect(() => {
    if (id || current !== STEPS.access || form.staff_role) return;
    const key = defaultRoleKey(rolesData, form.role);
    if (key) setForm(f => ({ ...f, staff_role: key, permissions: roleDefaults(rolesData, key) }));
  }, [id, current, form.role, form.staff_role, rolesData]);

  // Asks the server once per address whether it is in use. A failed check is forgotten and retried; saving still validates.
  function checkEmail(email) {
    if (!isValidEmail(email)) return Promise.resolve(null);
    const key = email.toLowerCase();
    if (!emailChecks.current.has(key)) {
      const query = new URLSearchParams({ email, ...(id ? { ignore: id } : {}) });
      emailChecks.current.set(key, apiRequest(`/users/email-available?${query}`)
        .then(result => !result.available)
        .catch(() => null)
        .then(taken => {
          if (taken === null) emailChecks.current.delete(key);
          else setTakenEmails(t => ({ ...t, [key]: taken }));
          return taken;
        }));
    }
    return emailChecks.current.get(key);
  }

  // Fields the admin has left are checked as they type, so problems show before Continue.
  function blur(key) {
    setTouched(t => ({ ...t, [key]: true }));
    if (key === "email") {
      setCheckingEmail(true);
      checkEmail(form.email).finally(() => setCheckingEmail(false));
    }
  }

  const liveErrors = {};
  if (current === STEPS.personal) {
    const found = validateAccountStep(STEPS.personal, form, { hasFacility: Boolean(home), confirmed });
    for (const key of Object.keys(touched)) if (found[key]) liveErrors[key] = found[key];
    if (touched.email && !found.email && takenEmails[form.email.toLowerCase()]) liveErrors.email = EMAIL_TAKEN;
  }
  const fieldError = key => errors[key] ?? liveErrors[key];
  // The icon on a Personal Details field; the email is only valid once the server has said it is free.
  const stateOf = key => fieldState({
    touched: touched[key], error: fieldError(key), checking: key === "email" && checkingEmail,
    confirmed: key === "email" ? takenEmails[form.email.toLowerCase()] === false : undefined,
  });

  function change(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function goTo(index) { setStep(index); setErrors({}); }

  // Changing the facility type invalidates the role, its duties and the steps built on them.
  function commitFacility(tier, facility) {
    setForm(f => applyFacilityChange(f, tier, facility ? Number(facility.id) : null));
    if (tier !== form.role) setReached(r => Math.min(r, 1));
    setConfirmed(false);
    setErrors(e => ({ ...e, role: undefined, facility: undefined }));
    setPicker(null);
  }

  function chooseTier(tier) {
    const proceed = () => tier === TIERS.admin ? commitFacility(tier, null) : setPicker(tier);
    // Editing an existing account to another tier discards its role and duties, so ask first.
    if (id && originalTier && form.role && tier !== form.role) {
      setPending({ title: "Change facility type?", description: "Changing the facility type will clear this account's role and access. Continue?", confirmText: "Change", apply: proceed });
    } else proceed();
  }

  function chooseRole(key) {
    if (key === form.staff_role) return;
    const apply = () => { setForm(f => ({ ...f, staff_role: key, permissions: roleDefaults(rolesData, key) })); setConfirmed(false); setErrors(e => ({ ...e, staff_role: undefined, permissions: undefined })); };
    if (needsReplaceConfirm(rolesData, form.staff_role, form.permissions)) {
      setPending({ title: "Replace access?", description: `Replace current access with ${roleFor(rolesData, key).label} defaults?`, confirmText: "Replace", apply });
    } else apply();
  }

  function changeAccess(key, on) {
    setForm(f => ({ ...f, permissions: setPermission(f.permissions, key, on) }));
    setConfirmed(false);
    setErrors(e => ({ ...e, permissions: undefined }));
  }

  // The stepper lets the admin revisit earlier steps, so saving re-checks every step, not just the last.
  function firstInvalid() {
    for (const [index, key] of keys.entries()) {
      const found = validateAccountStep(key, form, { hasFacility: Boolean(home), confirmed });
      if (Object.keys(found).length) return { index, found };
    }
    return null;
  }

  async function next(e) {
    e.preventDefault();
    const found = validateAccountStep(current, form, { hasFacility: Boolean(home), confirmed });
    if (current === STEPS.personal && !found.email) {
      setBusy(true);
      setCheckingEmail(true);
      const taken = await checkEmail(form.email);
      setCheckingEmail(false);
      setBusy(false);
      if (taken) found.email = EMAIL_TAKEN;
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!last) { setReached(r => Math.max(r, step + 1)); goTo(step + 1); return; }
    const invalid = firstInvalid();
    if (invalid) { goTo(invalid.index); setErrors(invalid.found); return; }
    await save();
  }

  async function save() {
    setBusy(true);
    const body = {
      name: form.name.trim(), email: form.email, contact_number: normalizeContactNumber(form.contact_number), role: form.role,
      staff_role: admin ? null : form.staff_role, permissions: admin ? [] : form.permissions, permissions_confirmed: true,
      barangay_health_center_id: form.barangay_health_center_id, rural_health_unit_id: form.rural_health_unit_id,
    };
    try {
      const result = await apiRequest(id ? `/users/${id}` : "/users", { method: id ? "PATCH" : "POST", body });
      const created = id ? null : {
        title: "Account created",
        message: result?.invite?.delivery === "failed" ? "The invite email could not be sent. Resend it from Password & Invites." : `An invite was sent to ${form.email}.`,
      };
      navigate("/admin/users", created ? { state: { notice: created } } : undefined);
    }
    catch (e) {
      const routed = routeServerErrors(e.errors);
      const target = keys.indexOf(routed.step);
      if (target >= 0) { setStep(target); setErrors(routed.fields); }
      const messages = target >= 0 ? routed.unrouted : routed.unrouted.length ? routed.unrouted : [e.message];
      if (messages.length) setNotice({ title: "Could not save the account", messages });
    }
    finally { setBusy(false); }
  }

  const details = [
    ["Facility", admin ? "Municipal Health Officer (not tied to a facility)" : homeName],
    ["Name", form.name], ["Email", form.email], ["Contact number", normalizeContactNumber(form.contact_number)],
    ["Role", admin ? "Municipal Health Officer" : role?.label],
    ...(id ? [] : [["Sign-in", "Invite link by email"]]),
  ];
  const [title, subtitle] = HEADINGS[current];
  const centered = current === STEPS.facility && !editLoading;

  return <DashboardLayout role="admin" title={id ? "Edit User Account" : "Create Account"} contentClassName="p-0">
    <form onSubmit={next} noValidate className="flex min-h-full w-full flex-col">
      <div className="w-full flex-1 px-3 py-3 sm:p-4 lg:p-5"><div className="mx-auto w-full max-w-[1500px]">
        <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-x-6">
        <AccountStepper steps={labels} current={step} reached={reached} onSelect={goTo} />
        <div className={`mt-4 min-w-0 md:mt-0 ${centered ? `md:flex md:flex-col md:justify-center ${STEPPER_HEIGHT}` : ""}`}>
        <header className={centered ? "text-center" : undefined}>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </header>
        <div className={`relative mt-5 ${centered ? "" : "mb-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"}`}>
          {editLoading && <div aria-busy="true" aria-label="Loading account" className="space-y-4"><span className={`block h-10 w-full ${pulse}`} /><span className={`block h-10 w-2/3 ${pulse}`} /><span className={`block h-10 w-1/2 ${pulse}`} /></div>}

          {!editLoading && current === STEPS.facility && <>
            <div className="grid gap-3 sm:grid-cols-3">{FACILITY_TYPES.map(({ tier, label, icon: Icon, description }) => {
              const selected = form.role === tier;
              return <button key={tier} type="button" aria-pressed={selected} onClick={() => chooseTier(tier)} className={facilityCard(selected)}>
                <Icon size={32} aria-hidden="true" className="text-red-700" />
                <span className="text-base">{label}</span>
                <span className="max-w-xs text-xs font-normal text-slate-600">{description}</span>
                {selected && tier !== TIERS.admin && <span className="text-xs font-normal text-slate-600">{homeName || "Facility selected"} · <span className="font-semibold text-red-700 underline">Change</span></span>}
                {selected && tier === TIERS.admin && <span className="text-xs font-normal text-slate-600">Not tied to a facility</span>}
              </button>;
            })}</div>
            <div className="absolute inset-x-0 top-full"><FieldMessage>{errors.role || errors.facility}</FieldMessage></div>
          </>}

          {!editLoading && current === STEPS.personal && <div className="grid grid-cols-1 gap-y-1">
        <Field label="Full name" error={fieldError("name")} state={stateOf("name")}><Input value={form.name} onChange={e => change("name", e.target.value)} onBlur={() => blur("name")} /></Field>
        <Field label="Email" error={fieldError("email")} state={stateOf("email")}><Input type="email" value={form.email} onChange={e => change("email", e.target.value)} onBlur={() => blur("email")} /></Field>
        <Field label="Contact number" error={fieldError("contact_number")} state={stateOf("contact_number")}><Input type="tel" inputMode="numeric" placeholder="09XX XXX XXXX" value={form.contact_number} onChange={e => change("contact_number", e.target.value)} onBlur={() => blur("contact_number")} /></Field>
      </div>}

          {!editLoading && current === STEPS.access && <>
            {rolesData
              ? <div role="group" aria-label="Role" className="grid gap-3 sm:grid-cols-3">{rolesForTier(rolesData, form.role).map(r => {
                const Icon = ROLE_ICONS[r.key] || UserRound;
                return <button key={r.key} type="button" aria-pressed={form.staff_role === r.key} onClick={() => chooseRole(r.key)} className={card(form.staff_role === r.key)}><Icon size={18} aria-hidden="true" className="text-red-700" />{r.label}</button>;
              })}</div>
              : <div aria-busy="true" aria-label="Loading roles" className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <span key={i} className={`block h-24 ${pulse}`} />)}</div>}
            <FieldMessage>{errors.staff_role || errors.permissions}</FieldMessage>
            {form.staff_role
              ? <PermissionMatrix permissions={form.permissions} available={availableDuties(rolesData, form.role)} defaults={defaults} licensedRole={Boolean(role?.licensed)} onChange={changeAccess} onReset={() => { setForm(f => ({ ...f, permissions: defaults })); setConfirmed(false); setErrors(e => ({ ...e, permissions: undefined })); }} />
              : <p className="text-sm text-slate-500">Choose a role to see its access.</p>}
          </>}

          {!editLoading && current === STEPS.review && <PermissionReviewSummary review={admin ? null : review} details={details} confirmed={confirmed} onConfirm={value => { setConfirmed(value); setErrors({}); }} confirmationLabel={ACCOUNT_CONFIRMATION} error={errors.confirmed} />}
        </div>
        </div>
        </div>
      </div></div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 lg:px-5">
        <div className="mx-auto flex w-full max-w-[1500px] justify-between gap-3">
          <button type="button" disabled={!step || busy} onClick={() => goTo(step - 1)} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm disabled:opacity-40">Back</button>
          <button type="submit" disabled={busy || !loaded} className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : last ? id ? "Save Changes" : "Create Account" : "Continue"}</button>
        </div>
      </div>
    </form>

    {/* Modals sit outside the form so Enter in their inputs can never submit it. */}
    {picker && <FacilityPickerModal tier={picker} facilities={activeIn(picker === TIERS.bhc ? facilities.bhc : facilities.rhu)} loading={!loaded} selectedId={form.role === picker ? facilityId : null} onSelect={facility => commitFacility(picker, facility)} onClose={() => setPicker(null)} />}
    <ConfirmationModal open={Boolean(pending)} title={pending?.title} description={pending?.description} confirmText={pending?.confirmText} onCancel={() => setPending(null)} onConfirm={() => { pending.apply(); setPending(null); }} />
    <NoticeModal open={Boolean(notice)} title={notice?.title} message={notice?.messages?.join(" ")} onClose={() => setNotice(null)} />
  </DashboardLayout>;
}
