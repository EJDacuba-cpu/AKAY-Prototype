import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import Input from "../../components/common/atoms/Input";
import Select from "../../components/common/atoms/Select";
import { apiRequest, unwrapData } from "../../services/apiClient";
import { getBarangayHealthCenters, getRuralHealthUnits } from "../../services/facilityService";
import { PERMISSION_PRESETS, ALL_PERMISSIONS } from "../../utils/actionPermissions";
import { compatiblePermissions, suggestedPreset } from "../../utils/accountSetup";

const empty = { name: "", email: "", password: "", role: "bhw", professional_designation: "", permissions: [], barangay_health_center_id: null, rural_health_unit_id: null };
const panel = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4";
const button = "rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40";
export default function AddUser() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("userId");
  const [form, setForm] = useState(empty);
  const [kind, setKind] = useState("staff");
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [facilities, setFacilities] = useState({ bhc: [], rhu: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);
  const steps = ["Account Type", "Personal Details", ...(kind === "staff" ? ["Home Facility", "Access & Permissions"] : []), id ? "Review & Save" : "Review & Create"];
  const current = steps[step];
  const last = step === steps.length - 1;
  const compatible = compatiblePermissions(form.professional_designation, form.role);
  const suggested = suggestedPreset(form.professional_designation, form.role);
  const home = form.barangay_health_center_id ? facilities.bhc.find(f => String(f.id) === String(form.barangay_health_center_id)) : facilities.rhu.find(f => String(f.id) === String(form.rural_health_unit_id));
  useEffect(() => {
    let active = true;
    Promise.all([getBarangayHealthCenters(), getRuralHealthUnits(), id ? apiRequest(`/users/${id}`) : null]).then(([bhc, rhu, response]) => {
      if (!active) return;
      setFacilities({ bhc, rhu });
      if (response) { const u = unwrapData(response); setForm({ ...empty, name:u.name, email:u.email, role:u.role, professional_designation:u.professional_designation || "", permissions:u.permissions || [], barangay_health_center_id:u.barangay_health_center_id, rural_health_unit_id:u.rural_health_unit_id }); setKind(u.role === "admin" ? "admin" : "staff"); }
      setLoaded(true);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [id]);
  function change(key, value) { setForm(f => ({ ...f, [key]: value, ...(key === "professional_designation" ? { permissions: [] } : {}) })); setConfirmed(false); }
  function validate() {
    if (current === "Personal Details") {
      if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a name and valid email.";
      if ((!id || form.password) && form.password.length < 8) return "Password must contain at least 8 characters.";
      if (!form.professional_designation) return "Select a professional designation.";
    }
    if (current === "Home Facility" && !home) return "Choose the primary BHC or RHU.";
    if (current === "Access & Permissions" && (!confirmed || !form.permissions.length)) return "Review the duties and confirm the permissions before continuing.";
    return "";
  }
  async function next(e) {
    e.preventDefault(); const invalid = validate(); setError(invalid); if (invalid) return;
    if (!last) { setStep(s => s + 1); return; }
    setBusy(true);
    const body = { ...form, role:kind === "admin" ? "admin" : form.role, permissions:kind === "admin" ? [] : form.permissions, permissions_confirmed:true, barangay_health_center_id:kind === "admin" ? null : form.barangay_health_center_id, rural_health_unit_id:kind === "admin" ? null : form.rural_health_unit_id };
    if (!body.password) delete body.password;
    try { await apiRequest(id ? `/users/${id}` : "/users", { method:id ? "PATCH" : "POST", body }); navigate("/admin/users"); }
    catch(e) { setError(Object.values(e.errors || {}).flat().join(" ") || e.message); }
    finally { setBusy(false); }
  }
  return <DashboardLayout role="admin" title={id ? "Edit User Account" : "Create Account"}><form onSubmit={next} className="mx-auto max-w-4xl space-y-5 pb-8">
    <button type="button" className="text-sm text-red-700" onClick={() => navigate("/admin/users")}>← Account Directory</button>
    <ol aria-label="Account setup progress" className="flex flex-wrap gap-2">{steps.map((label,i) => <li key={label} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3 py-2 text-xs font-semibold ${i === step ? "bg-red-700 text-white" : i < step ? "bg-red-50 text-red-700" : "bg-white text-slate-500"}`}>{i+1}. {label}</li>)}</ol>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className={panel}><h1 className="text-lg font-bold">{current}</h1>
    {current === "Account Type" && <div className="grid gap-3 sm:grid-cols-2">{[["admin","Admin / MHO","Centralized account, facility, and access management."],["staff","Facility Staff","Personal staff account with a primary BHC or RHU."]].map(([key,label,description]) => <button key={key} type="button" aria-pressed={kind === key} onClick={() => { setKind(key); setConfirmed(false); }} className={`rounded-xl border p-5 text-left ${kind === key ? "border-red-600 bg-red-50" : "border-slate-200"}`}><strong>{label}</strong><p className="mt-2 text-sm text-slate-500">{description}</p></button>)}</div>}
    {current === "Personal Details" && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Full name<Input value={form.name} onChange={e => change("name",e.target.value)}/></label><label className="text-sm">Email<Input type="email" value={form.email} onChange={e => change("email",e.target.value)}/></label><label className="text-sm">{id ? "New password (optional)" : "Password"}<Input type="password" autoComplete="new-password" value={form.password} onChange={e => change("password",e.target.value)}/></label><label className="text-sm">Professional designation<Select placeholder="Select designation" value={form.professional_designation} onChange={e => change("professional_designation",e.target.value)} options={["Midwife","Nurse","Doctor","Encoder","BHW","Logistics","MHO","Other"].map(v => ({value:v,label:v}))}/></label></div>}
    {current === "Home Facility" && <><p className="text-sm text-slate-500">Choose where this person is primarily based. Additional BHC access for RHU-based nurses is managed later in Staff Assignments.</p><Select aria-label="Home Facility" placeholder="Select home facility" value={home ? `${form.barangay_health_center_id ? "bhc" : "rhu"}:${home.id}` : ""} options={Object.entries(facilities).flatMap(([type,list]) => list.filter(f => !f.status || f.status === "active").map(f => ({value:`${type}:${f.id}`,label:`${type.toUpperCase()} · ${f.name}`})))} onChange={e => { const [type,value]=e.target.value.split(":"); setForm(f => ({...f,role:type === "bhc" ? "bhw" : "rhu_staff",barangay_health_center_id:type === "bhc" ? Number(value) : null,rural_health_unit_id:type === "rhu" ? Number(value) : null,permissions:[]}));setConfirmed(false); }}/></>}
    {current === "Access & Permissions" && <><p className="text-sm text-slate-500">Suggested: <strong>{PERMISSION_PRESETS[suggested].label}</strong>. Select a compatible preset, review the duties, and confirm.</p><div className="grid gap-3 sm:grid-cols-2">{Object.entries(PERMISSION_PRESETS).filter(([,p]) => p.permissions.every(v => compatible.includes(v))).map(([key,p]) => <button key={key} type="button" aria-pressed={p.permissions.every(v => form.permissions.includes(v)) && form.permissions.length === p.permissions.length} onClick={() => {change("permissions",[...p.permissions]);}} className={`rounded-lg border p-4 text-left ${p.permissions.every(v => form.permissions.includes(v)) ? "border-red-600 bg-red-50" : "border-slate-200"}`}><strong className="text-sm">{p.label}{key === suggested ? " · Suggested" : ""}</strong><p className="mt-1 text-xs text-slate-500">{p.description}</p></button>)}</div><details className="rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Additional Permissions</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{ALL_PERMISSIONS.filter(p => compatible.includes(p)).map(p => <label key={p} className="flex gap-2 text-xs"><input type="checkbox" checked={form.permissions.includes(p)} onChange={e => change("permissions",e.target.checked ? [...form.permissions,p] : form.permissions.filter(v => v !== p))}/>{p.replaceAll("."," · ")}</label>)}</div><p className="mt-3 text-xs text-slate-500">Dispensing must be explicitly authorized; it does not grant prescribing authority.</p></details><label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>I have reviewed and confirm these permissions for this staff member.</label></>}
    {last && <dl className="grid gap-4 text-sm sm:grid-cols-2">{[["Account Type",kind === "admin" ? "Admin / MHO" : "Facility Staff"],["Name",form.name],["Email",form.email],["Designation",form.professional_designation],["Home Facility",kind === "admin" ? "Not applicable" : home?.name],["Credentials",form.password ? "Password set (hidden)" : "Existing password retained"],["Permissions",kind === "admin" ? "Account and facility administration" : form.permissions.join(", ")],["Additional Assignments","Managed separately after account creation"]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>}
    </section><div className="flex justify-between"><button type="button" disabled={!step || busy} onClick={() => {setStep(s => s-1);setError("");}} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm disabled:opacity-40">Back</button><button type="submit" disabled={busy || !loaded} className={button}>{busy ? "Saving…" : last ? id ? "Save Changes" : "Create Account" : "Continue"}</button></div>
  </form></DashboardLayout>;
}
