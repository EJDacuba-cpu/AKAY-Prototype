import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import "./staff-assignments.css";
import { ArrowLeft, Plus } from "lucide-react";
import { PageStateWrapper, SearchField, SearchFilterCluster, TablePagination } from "../../components/common";
import ListFilterPopover from "../../components/common/filters/ListFilterPopover";
import PlainStatusStamp from "../../components/common/badges/PlainStatusStamp";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Card } from "../../components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import PermissionReviewDialog from "../../components/features/access/PermissionReviewDialog";
import { ASSIGNMENT_CONFIRMATION } from "../../components/features/access/PermissionReviewSummary";
import { apiRequest, unwrapList } from "../../services/apiClient";
import { NURSE_ASSIGNMENT_DUTIES, PERMISSION_CATALOG, PERMISSION_GROUPS, suggestedNurseDuties } from "../../utils/actionPermissions";
import { reviewPermissions, setPermission } from "../../utils/accessPolicy";
import usePagedRows from "../../hooks/usePagedRows";
import useNotification from "../../hooks/useNotification";
import { tableBodyHeight } from "../../utils/tablePaging";

const DEFAULT_FILTERS = { search: "", status: "all" };
const FIELD_CLASS = "h-9 rounded-lg border-neutral-200 text-[13px] text-ink-800 shadow-none";
const LABEL_CLASS = "mb-1.5 block text-[11px] font-semibold text-neutral-700";
const DUTY_GROUPS = PERMISSION_GROUPS.map((group) => ({
  ...group,
  permissions: NURSE_ASSIGNMENT_DUTIES.filter((key) => PERMISSION_CATALOG[key]?.group === group.key),
})).filter((group) => group.permissions.length > 0);

function initialForm(userId = "") {
  return { user_id: userId, barangay_health_center_id: "", assignment_type: "temporary", starts_on: "", ends_on: "", permissions: [] };
}

function assignmentState(row, today) {
  if (row.revoked_at) return "Revoked";
  if (row.starts_on?.slice(0, 10) > today) return "Scheduled";
  if (row.ends_on && row.ends_on.slice(0, 10) < today) return "Expired";
  return "Active";
}

function fieldErrors(error) {
  return Object.entries(error?.errors || {}).reduce((result, [key, value]) => {
    const field = key.split(".")[0];
    result[field] = Array.isArray(value) ? value.join(" ") : String(value);
    return result;
  }, {});
}

export default function StaffAssignments({ mode = "directory" }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const creating = mode === "create";
  const notify = useNotification();
  const id = useId();
  const formHeadingRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [nurses, setNurses] = useState([]);
  const [bhcs, setBhcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState(() => initialForm(params.get("userId") || ""));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    const [assignments, eligible, facilities] = await Promise.all([
      apiRequest("/staff-assignments"),
      apiRequest("/staff-assignments/eligible-nurses"),
      apiRequest("/barangay-health-centers"),
    ]);
    setRows(unwrapList(assignments));
    setNurses(unwrapList(eligible));
    setBhcs(unwrapList(facilities));
  }, []);

  const firstLoad = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { await load(); } catch (error) { setLoadError(error); } finally { setLoading(false); }
  }, [load]);

  useEffect(() => { firstLoad(); }, [firstLoad]);
  useEffect(() => { if (creating && !loading) formHeadingRef.current?.focus(); }, [creating, loading]);

  const activeBhcs = bhcs.filter((bhc) => bhc.status === "active");
  const nurse = nurses.find((item) => String(item.id) === String(form.user_id));
  const bhc = bhcs.find((item) => String(item.id) === String(form.barangay_health_center_id));
  const today = new Date().toLocaleDateString("en-CA");
  const review = reviewPermissions({ permissions: form.permissions, defaults: NURSE_ASSIGNMENT_DUTIES, licensedRole: true });
  const visibleRows = useMemo(() => rows.filter((row) => {
    const search = filters.search.trim().toLowerCase();
    const text = [row.user?.name, row.barangay_health_center?.name, row.assignment_type].filter(Boolean).join(" ").toLowerCase();
    return (!search || text.includes(search)) && (filters.status === "all" || assignmentState(row, today) === filters.status);
  }), [rows, filters, today]);
  const { page, setPage, totalPages, pageRows } = usePagedRows(visibleRows, filters);

  function changeField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError("");
  }

  function openForm() {
    const userId = params.get("userId");
    navigate(`/admin/staff-assignments/add${userId ? `?userId=${encodeURIComponent(userId)}` : ""}`);
  }

  function cancelForm() {
    if (busy) return;
    setForm(initialForm(params.get("userId") || ""));
    navigate("/admin/staff-assignments");
    setErrors({});
    setSubmitError("");
  }

  function requestSave(event) {
    event.preventDefault();
    if (busy) return;
    const next = {};
    if (!nurse) next.user_id = "Select an eligible RHU-based nurse.";
    if (!activeBhcs.some((item) => String(item.id) === String(form.barangay_health_center_id))) next.barangay_health_center_id = "Select an active BHC.";
    if (!form.starts_on) next.starts_on = "Select a start date.";
    if (form.assignment_type === "temporary" && !form.ends_on) next.ends_on = "Select an end date for a temporary assignment.";
    else if (form.assignment_type === "temporary" && form.ends_on < form.starts_on) next.ends_on = "End date must be on or after the start date.";
    if (!form.permissions.length) next.permissions = "Select at least one permitted duty.";
    setErrors(next);
    setSubmitError("");
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.getElementById(`${id}-${Object.keys(next)[0]}`)?.focus());
      return;
    }
    setReviewing(true);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("/staff-assignments", { method: "POST", body: { ...form, ...(form.assignment_type === "ongoing" ? { ends_on: undefined } : {}) } });
      setReviewing(false);
      setForm((current) => ({ ...initialForm(current.user_id), assignment_type: current.assignment_type }));
      setErrors({});
      setSubmitError("");
      notify.success("Nurse assignment created.");
      try { await load(); } catch { notify.error("Assignment created, but the list could not refresh. Reload this page to see it."); }
      navigate("/admin/staff-assignments", { replace: true });
    } catch (error) {
      setReviewing(false);
      const next = fieldErrors(error);
      setErrors(next);
      setSubmitError(Object.keys(next).length ? "" : error.message || "The assignment could not be saved. Try again.");
    } finally { setBusy(false); }
  }

  async function revoke(row) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/staff-assignments/${row.id}/revoke`, { method: "POST" });
      notify.success("Assignment revoked.");
      try { await load(); } catch { notify.error("Assignment revoked, but the list could not refresh. Reload this page."); }
    } catch (error) { notify.error(error.message || "The assignment could not be revoked. Try again."); }
    finally { setBusy(false); }
  }

  function inputProps(key) {
    return { id: `${id}-${key}`, value: form[key], onChange: (event) => changeField(key, event.target.value), disabled: busy, "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `${id}-${key}-error` : undefined, className: FIELD_CLASS };
  }

  const noEligibility = !nurses.length || !activeBhcs.length;
  const narrowed = Boolean(filters.search.trim()) || filters.status !== "all";

  if (!creating && params.get("userId")) {
    return <Navigate to={`/admin/staff-assignments/add?userId=${encodeURIComponent(params.get("userId"))}`} replace />;
  }

  return (
    <DashboardLayout role="admin" title={creating ? "Add Nurse Assignment" : "Staff Assignments"}>
      <PageStateWrapper skeleton="table" isLoading={loading} isError={Boolean(loadError)} hasData={!loading && !loadError} error={loadError} onRetry={firstLoad} loadingMessage="Loading staff assignments...">
        <div className="staff-assignments staff-assignment-content mx-auto w-full max-w-[1500px] space-y-4">
          {creating && <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 text-[12px] text-neutral-600" onClick={cancelForm} disabled={busy}><ArrowLeft size={14} aria-hidden="true" />Back to Staff Assignments</Button>}
          <header className="staff-assignment-header flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 ref={formHeadingRef} tabIndex={-1} id={`${id}-form-title`} className="staff-assignment-title rounded-sm text-[18px] font-bold leading-[1.3] tracking-tight text-ink-800 outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50">{creating ? "Add nurse assignment" : "Staff assignments"}</h1>
              <p className="mt-1 max-w-[65ch] text-[13px] leading-5 text-neutral-600">{creating ? "Choose the facility, assignment period, and duties to grant." : "Additional BHC access for RHU-based nurses. Home RHU and referral routing stay unchanged."}</p>
            </div>
            {!creating && <Button variant="default" size="sm" className="rounded-full text-[13px]" onClick={openForm} disabled={busy}>
              <Plus size={14} aria-hidden="true" />Add Assignment
            </Button>}
          </header>

          {creating && (
            <Card className="staff-assignment-form rounded-xl border-neutral-200 text-ink-800">
              <form id={`${id}-form`} onSubmit={requestSave} noValidate aria-labelledby={`${id}-form-title`}>
                <fieldset disabled={busy} className="staff-assignment-fields grid min-w-0 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                  <legend className="sr-only">Nurse assignment details</legend>
                  <div className="space-y-4">
                    <h3 className="text-[13px] font-semibold">Nurse and facility</h3>
                    <div><label htmlFor={`${id}-user_id`} className={LABEL_CLASS}>Eligible nurse</label><Select {...inputProps("user_id")} required><option value="">{nurses.length ? "Select RHU-based nurse" : "No eligible RHU-based nurses"}</option>{nurses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.rural_health_unit?.name || "RHU"}</option>)}</Select><FieldError id={id} field="user_id" message={errors.user_id} /></div>
                    <div><label htmlFor={`${id}-barangay_health_center_id`} className={LABEL_CLASS}>Destination BHC</label><Select {...inputProps("barangay_health_center_id")} required><option value="">{activeBhcs.length ? "Select BHC" : "No active BHCs"}</option>{activeBhcs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><FieldError id={id} field="barangay_health_center_id" message={errors.barangay_health_center_id} /></div>
                    <div className="border-t border-neutral-200 pt-4">
                      <h3 className="mb-3 text-[13px] font-semibold">Assignment period</h3>
                      <div className="space-y-3">
                        <div><label htmlFor={`${id}-assignment_type`} className={LABEL_CLASS}>Assignment type</label><Select {...inputProps("assignment_type")}><option value="temporary">Temporary · end date required</option><option value="ongoing">Ongoing · until revoked</option></Select><FieldError id={id} field="assignment_type" message={errors.assignment_type} /></div>
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                          <div className="min-w-0"><label htmlFor={`${id}-starts_on`} className={LABEL_CLASS}>Start date</label><Input {...inputProps("starts_on")} type="date" required /><FieldError id={id} field="starts_on" message={errors.starts_on} /></div>
                          {form.assignment_type === "temporary" && <div className="min-w-0"><label htmlFor={`${id}-ends_on`} className={LABEL_CLASS}>End date</label><Input {...inputProps("ends_on")} type="date" min={form.starts_on} required /><FieldError id={id} field="ends_on" message={errors.ends_on} /></div>}
                        </div>
                        {form.assignment_type === "ongoing" && <p className="text-[12px] leading-5 text-neutral-600">Access continues from the start date until this assignment is revoked.</p>}
                      </div>
                    </div>
                  </div>
                  <fieldset className="min-w-0" aria-describedby={errors.permissions ? `${id}-permissions-error` : undefined}>
                    <legend className="text-[13px] font-semibold">Permitted duties</legend>
                    <p className="mt-1 text-[12px] leading-5 text-neutral-600">Choose only the duties this nurse needs at the destination BHC.</p>
                    <Button type="button" variant="secondary" size="compact" className="my-3" onClick={() => changeField("permissions", suggestedNurseDuties())}>Use suggested clinical duties</Button>
                    <div id={`${id}-permissions`} tabIndex={-1} className="staff-assignment-duty-grid grid gap-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 sm:grid-cols-2">
                      {DUTY_GROUPS.map((group) => <div key={group.key}><h4 className="mb-2 text-[11px] font-semibold text-neutral-600">{group.label}</h4><div className="space-y-2">{group.permissions.map((key) => <label key={key} className="flex cursor-pointer items-start gap-2 text-[12px] leading-5 text-ink-800"><input type="checkbox" checked={form.permissions.includes(key)} onChange={(event) => changeField("permissions", setPermission(form.permissions, key, event.target.checked))} className="mt-1 size-3.5 shrink-0 accent-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50" /><span title={PERMISSION_CATALOG[key]?.note}>{PERMISSION_CATALOG[key]?.label || key}</span></label>)}</div></div>)}
                    </div>
                    <FieldError id={id} field="permissions" message={errors.permissions} />
                  </fieldset>
                </fieldset>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
                  <div className="min-w-0 text-[12px] text-neutral-600"><span aria-live="polite">{form.permissions.length} duties selected</span>{submitError && <p role="alert" className="mt-1 text-alert-700">{submitError}</p>}</div>
                  <div className="flex items-center gap-2"><Button type="button" variant="secondary" size="sm" onClick={cancelForm} disabled={busy}>Cancel</Button><Button type="submit" variant="brand" size="sm" disabled={busy || noEligibility}>{busy ? "Saving..." : "Review Assignment"}</Button></div>
                </div>
              </form>
            </Card>
          )}

          {!creating && <>
          <div className="staff-assignment-list-toolbar flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] tabular-nums text-neutral-600" aria-live="polite">{narrowed ? `${visibleRows.length} of ${rows.length}` : rows.length} {rows.length === 1 ? "assignment" : "assignments"}</p>
            <SearchFilterCluster search={<SearchField value={filters.search} onChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Search nurse or BHC" label="Search nurse, BHC, or assignment type" />} filter={<ListFilterPopover ariaLabel="Assignment filters" applied={filters} fields={[{ key: "status", label: "Status", resetValue: "all", options: [{ value: "all", label: "All statuses" }, "Active", "Scheduled", "Expired", "Revoked"], fullWidth: true }]} activeFilters={filters.status === "all" ? [] : [{ key: "status", label: `Status: ${filters.status}` }]} onApply={(next) => setFilters((current) => ({ ...current, ...next }))} onRemoveFilter={() => setFilters((current) => ({ ...current, status: "all" }))} onClearAll={() => setFilters((current) => ({ ...current, status: "all" }))} buildDefaults={() => ({ status: "all" })} />} />
          </div>

          <div className="staff-assignment-sheet min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-auto" style={{ height: tableBodyHeight() }}>
              {pageRows.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"><h2 className="text-[14px] font-semibold text-ink-800">{narrowed ? "No matching assignments" : "No nurse assignments yet"}</h2><p className="max-w-md text-[13px] leading-5 text-neutral-600">{narrowed ? "Try a different search or clear the status filter." : "Assignments give RHU-based nurses additional access to a BHC for the duties you approve."}</p>{narrowed ? <Button variant="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear search and filters</Button> : !noEligibility ? <Button variant="secondary" size="sm" onClick={openForm}><Plus size={14} />Add Assignment</Button> : null}</div> : <>
                <table className="hidden w-full min-w-[1000px] table-fixed text-left md:table"><caption className="sr-only">Nurse assignments to barangay health centers</caption><colgroup><col className="w-[23%]" /><col className="w-[23%]" /><col className="w-[24%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[8%]" /></colgroup><thead className="h-11 bg-neutral-100 text-[10px] font-bold uppercase tracking-wide text-neutral-600"><tr>{["Nurse", "Destination BHC", "Assignment period", "Duties", "Status", "Actions"].map((label) => <th key={label} scope="col" className="px-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-neutral-100">{pageRows.map((row) => <tr key={row.id} className="h-14 hover:bg-neutral-50"><td className="px-3"><p className="truncate text-[13px] font-semibold text-ink-800" title={row.user?.name}>{row.user?.name || "Not recorded"}</p>{row.user?.rural_health_unit?.name && <p className="truncate text-[11px] text-neutral-600" title={row.user.rural_health_unit.name}>{row.user.rural_health_unit.name}</p>}</td><td className="px-3"><p className="truncate text-[13px] text-ink-800" title={row.barangay_health_center?.name}>{row.barangay_health_center?.name || "Not recorded"}</p></td><td className="px-3"><p className="text-[12px] tabular-nums text-ink-800">{row.starts_on?.slice(0, 10) || "Not recorded"} → {row.ends_on?.slice(0, 10) || "Until revoked"}</p><p className="mt-0.5 text-[11px] capitalize text-neutral-600">{row.assignment_type}</p></td><td className="px-3"><AssignmentDuties permissions={row.permissions} /></td><td className="px-3"><AssignmentStatus row={row} today={today} /></td><td className="px-2">{!row.revoked_at ? <Button variant="ghost" size="compact" className="rounded-full px-2 text-[12px] text-alert-700 hover:bg-alert-50 hover:text-alert-800" disabled={busy} onClick={() => revoke(row)} aria-label={`Revoke assignment for ${row.user?.name || "nurse"}`}>Revoke</Button> : <span className="text-[12px] text-neutral-600">—</span>}</td></tr>)}</tbody></table>
                <div className="divide-y divide-neutral-100 md:hidden">{pageRows.map((row) => <article key={row.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-ink-800">{row.user?.name || "Not recorded"}</h2><p className="mt-1 text-[12px] text-neutral-600">{row.barangay_health_center?.name || "Not recorded"}</p></div><AssignmentStatus row={row} today={today} /></div><p className="text-[12px] tabular-nums text-neutral-600">{row.starts_on?.slice(0, 10) || "Not recorded"} → {row.ends_on?.slice(0, 10) || "Until revoked"} · {row.assignment_type}</p><div className="flex items-center justify-between gap-3"><AssignmentDuties permissions={row.permissions} />{!row.revoked_at && <Button variant="secondary" size="compact" disabled={busy} onClick={() => revoke(row)}>Revoke assignment</Button>}</div></article>)}</div>
              </>}
            </div>
            <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} alwaysShow />
          </div>
          </>}
        </div>
        {reviewing && <PermissionReviewDialog title="Review assignment duties" review={review} confirmationLabel={ASSIGNMENT_CONFIRMATION} confirmText="Create Assignment" loading={busy} onCancel={() => !busy && setReviewing(false)} onConfirm={save} details={[["Nurse", nurse?.name || "—"], ["Destination BHC", bhc?.name || "—"], ["Assignment", form.assignment_type === "ongoing" ? `Ongoing from ${form.starts_on}` : `${form.starts_on} → ${form.ends_on}`]]} />}
      </PageStateWrapper>
    </DashboardLayout>
  );
}

function FieldError({ id, field, message }) {
  return message ? <p id={`${id}-${field}-error`} role="alert" className="mt-1.5 text-[12px] leading-5 text-alert-700">{message}</p> : null;
}

function AssignmentStatus({ row, today }) {
  const label = assignmentState(row, today);
  return <PlainStatusStamp label={label} tone={{ Active: "success", Scheduled: "info", Expired: "warning", Revoked: "neutral" }[label]} />;
}

function AssignmentDuties({ permissions = [] }) {
  return <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="compact" className="rounded-full px-2 text-[12px] text-neutral-700 underline decoration-neutral-300 underline-offset-4">{permissions.length} duties</Button></PopoverTrigger><PopoverContent align="start" className="w-[min(calc(100vw-1.5rem),320px)] rounded-xl p-4"><h3 className="text-[13px] font-semibold text-ink-800">Permitted duties</h3><ul className="mt-3 space-y-2 text-[12px] leading-5 text-neutral-700">{permissions.map((key) => <li key={key}>{PERMISSION_CATALOG[key]?.label || key}</li>)}</ul>{!permissions.length && <p className="mt-2 text-[12px] text-neutral-600">No duties recorded.</p>}</PopoverContent></Popover>;
}
