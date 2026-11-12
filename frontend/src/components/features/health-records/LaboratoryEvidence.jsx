import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Paperclip, Plus } from "lucide-react";
import { Button } from "../../ui/button";
import ModalShell from "../../common/modals/ModalShell";
import { LABORATORY_STATUSES, laboratoryErrors, laboratorySummary, newLaboratoryTest, sortLaboratoryOptionsByRelevance } from "../../../utils/laboratoryTests";
import { getLaboratoryAttachments, previewLaboratoryAttachment, removeLaboratoryAttachment, saveLaboratoryAddendum, uploadLaboratoryAttachment } from "../../../services/laboratoryService";

const controlClass = "mt-1 min-h-9 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-ink-400";

export function LaboratoryFields({ entry, onChange, errors = {}, prefix = "", disabled = false }) {
  const change = (key, value) => onChange({ ...entry, [key]: value });
  return <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">
    <LabField label="Test Name" required error={errors[`${prefix}.testName`]}>
      <input name={`${prefix}.testName`} aria-invalid={Boolean(errors[`${prefix}.testName`]) || undefined} className={controlClass} value={entry.testName} maxLength={255} required onChange={event => change("testName", event.target.value)} />
    </LabField>
    <LabField label="Result Status" error={errors[`${prefix}.resultStatus`]}>
      <select name={`${prefix}.resultStatus`} aria-invalid={Boolean(errors[`${prefix}.resultStatus`]) || undefined} className={controlClass} value={entry.resultStatus} onChange={event => change("resultStatus", event.target.value)}>
        {LABORATORY_STATUSES.map(status => <option key={status}>{status}</option>)}
      </select>
    </LabField>
    <LabField label="Collection Date" error={errors[`${prefix}.collectionDate`]}><input name={`${prefix}.collectionDate`} type="date" className={controlClass} value={entry.collectionDate || ""} onChange={event => change("collectionDate", event.target.value)} /></LabField>
    <LabField label="Examination Date" error={errors[`${prefix}.examinationDate`]}><input name={`${prefix}.examinationDate`} type="date" className={controlClass} value={entry.examinationDate || ""} onChange={event => change("examinationDate", event.target.value)} /></LabField>
    <div className="sm:col-span-2"><LabField label="Laboratory Result" required={entry.resultStatus === "Result Available"} error={errors[`${prefix}.result`]}>
      <textarea name={`${prefix}.result`} aria-invalid={Boolean(errors[`${prefix}.result`]) || undefined} rows={3} maxLength={10000} className={controlClass} value={entry.result || ""} required={entry.resultStatus === "Result Available"} onChange={event => change("result", event.target.value)} />
    </LabField></div>
  </fieldset>;
}

function LabField({ label, required, error, children }) {
  return <label className="block min-w-0 text-xs font-medium text-neutral-700"><span>{label}{required ? " *" : ""}</span>{children}{error && <span role="alert" className="mt-1 block text-red-700">{error}</span>}</label>;
}

export function LaboratoryAttachments({ context, attachments, readOnly = false, disabled = false, reason = "", onBusyChange, onChanged, onFilesChange, uploadsAvailable }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const query = useQuery({
    queryKey: ["laboratory-attachments", context.patientId, context.consultationUuid, context.testId],
    queryFn: () => getLaboratoryAttachments(context),
    enabled: !readOnly && !context.recordId && Boolean(context.visitId && context.consultationUuid && context.testId),
  });
  const files = attachments ?? query.data?.data ?? [];
  useEffect(() => {
    if (query.data?.data) onFilesChange?.(query.data.data);
    // A callback rerender must not rehydrate attachment state or reset sharing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  async function run(fn) {
    setBusy(true); onBusyChange?.(true); setError("");
    try { await fn(); } catch (failure) { setError(failure.message || "Unable to update attachments."); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  const upload = (event, replaceAttachmentId = "") => {
    const selected = [...(event.target.files || [])];
    event.target.value = "";
    if (!selected.length) return;
    void run(async () => {
      try {
        for (const file of selected) {
          if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose PDF, JPG, or PNG files up to 10 MB each.");
          await uploadLaboratoryAttachment(context, file, reason, replaceAttachmentId);
        }
      } finally {
        // Preserve and show earlier successful uploads if a later file fails.
        if (!context.recordId) await query.refetch();
        await onChanged?.();
      }
    });
  };
  const uploadsUnavailable = uploadsAvailable === false || query.data?.uploads_available === false;
  const uploadDisabled = busy || disabled || uploadsUnavailable || (!context.recordId && !context.visitId);
  return <div className="min-w-0 space-y-2">
    <p className="text-xs font-medium text-neutral-700">Supporting Attachments</p>
    {query.isPending && query.isFetching && <p role="status" className="text-xs text-neutral-500">Loading attachments…</p>}
    {query.isError && <p role="alert" className="text-xs text-red-700">Unable to load attachments. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    <ul className="space-y-1">
      {files.map(file => <li key={file.id} className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <Paperclip size={13} aria-hidden="true" />
        <button type="button" disabled={busy || disabled} className="min-w-0 max-w-full break-all text-left text-ink-900 underline underline-offset-2 focus-visible:ring-2" onClick={() => run(async () => {
          const blob = await previewLaboratoryAttachment(file.id, context);
          setPreview({ url: URL.createObjectURL(blob), mime: file.mime_type, name: file.name });
        })}>Preview {file.name}</button>
        {!readOnly && <label htmlFor={`${inputId}-replace-${file.id}`} className="inline-flex min-h-8 cursor-pointer items-center rounded-full border border-neutral-200 px-3 text-xs font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2">
          Replace<input id={`${inputId}-replace-${file.id}`} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={disabled || busy || (context.recordId && !reason.trim()) || uploadsUnavailable} onChange={event => upload(event, file.id)} />
        </label>}
        {!readOnly && <Button type="button" variant="ghost" size="compact" disabled={disabled || busy || (context.recordId && !reason.trim())} onClick={() => run(async () => {
          await removeLaboratoryAttachment(file.id, context, reason);
          if (!context.recordId) await query.refetch();
          await onChanged?.();
        })}>Remove</Button>}
      </li>)}
    </ul>
    {!readOnly && <>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${inputId}-upload`} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-3 text-xs font-medium ${uploadDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-neutral-50"}`}>
          <Paperclip size={13} aria-hidden="true" />Upload File
          <input id={`${inputId}-upload`} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={uploadDisabled || (context.recordId && !reason.trim())} onChange={upload} />
        </label>
        <label htmlFor={`${inputId}-camera`} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-3 text-xs font-medium [@media(hover:hover)_and_(pointer:fine)]:hidden ${uploadDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-neutral-50"}`}>
          <Camera size={13} aria-hidden="true" />Take Photo
          <input id={`${inputId}-camera`} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" disabled={uploadDisabled || (context.recordId && !reason.trim())} onChange={upload} />
        </label>
      </div>
      <p className="text-xs text-neutral-500">{uploadsUnavailable ? "Uploads unavailable: durable private storage needs administrator configuration." : "PDF, JPG, or PNG · Up to 10 MB each · 10 files per test. Upload a replacement before removing the previous file."}</p>
      {busy && <p role="status" className="text-xs text-neutral-600">Updating attachments…</p>}
    </>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {preview && <ModalShell open title={preview.name} size="wide" onClose={() => setPreview(null)}>
      {preview.mime === "application/pdf" && <a href={preview.url} target="_blank" rel="noreferrer" className="mb-3 inline-block text-sm text-ink-900 underline">Open PDF in a new tab</a>}
      {preview.mime === "application/pdf" ? <iframe title={preview.name} src={preview.url} sandbox="allow-same-origin" className="h-[65vh] w-full" /> : <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />}
    </ModalShell>}
  </div>;
}

export function LaboratoryEvidenceList({ entries = [], emptyMessage = "No laboratory evidence recorded.", context = {} }) {
  if (!entries.length) return <p className="text-xs text-neutral-500">{emptyMessage}</p>;
  return <ul className="divide-y divide-neutral-200">
    {entries.map((entry, index) => <li key={`${entry.handoffId || ""}-${entry.recordId || entry.id}-${index}`} className="min-w-0 space-y-2 py-3 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="break-words text-sm font-semibold text-ink-900">{entry.testName}</h4><span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600">{entry.resultStatus}</span></div>
      <p className="text-xs text-neutral-500">Collection: {entry.collectionDate || "Not recorded"} · Examination: {entry.examinationDate || "Not recorded"}</p>
      {entry.result && <p className="whitespace-pre-wrap break-words text-sm text-neutral-700">{entry.result}</p>}
      {entry.sharedAt && <p className="text-xs text-neutral-500">Shared {new Date(entry.sharedAt).toLocaleString()}. Later addenda require a sharing update.</p>}
      {entry.conditionName && <p className="text-xs text-neutral-500">For monitoring: {entry.conditionName}</p>}
      {entry.attachments?.length > 0 && <LaboratoryAttachments readOnly attachments={entry.attachments} context={{ ...context, recordId: entry.healthRecordId, testId: entry.id, handoffId: entry.handoffId }} />}
    </li>)}
  </ul>;
}

export function LaboratoryTestsEditor({ tests, onChange, context, errors = {}, disabled = false, onBusyChange, onAttachmentsChange }) {
  const client = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [removeError, setRemoveError] = useState("");
  async function removeTest(entry) {
    onBusyChange?.(true); setRemoveError("");
    try {
      const scope = { ...context, testId: entry.id };
      const response = await getLaboratoryAttachments(scope);
      for (const file of response.data || []) await removeLaboratoryAttachment(file.id, scope);
      onChange(tests.filter(test => test.id !== entry.id));
    } catch (error) { setRemoveError(error.message || "Unable to remove this test. Please retry."); }
    finally {
      await client.invalidateQueries({ queryKey: ["laboratory-attachments", context.patientId, context.consultationUuid, entry.id] });
      onBusyChange?.(false);
    }
  }
  return <section className="mt-6 min-w-0 space-y-3 border-t border-neutral-200 pt-4" aria-label="Laboratory & Diagnostic Tests">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-ink-900">Laboratory &amp; Diagnostic Tests</h3><p className="mt-1 text-xs text-neutral-500">Record any test. Repeated tests may be entered separately.</p></div>
      <Button type="button" variant="secondary" size="compact" disabled={disabled || tests.length >= 50} onClick={() => { const entry = newLaboratoryTest(); onChange([...tests, entry]); setEditingId(entry.id); }}><Plus size={14} />Add Test</Button>
    </div>
    {!tests.length && <p className="text-xs text-neutral-500">No tests added for this visit.</p>}
    {removeError && <p role="alert" className="text-xs text-red-700">{removeError}</p>}
    {tests.map((entry, index) => {
      const prefix = `laboratoryTests.${index}`;
      const editing = editingId === entry.id || Object.keys(errors).some(key => key.startsWith(`${prefix}.`));
      return <div key={entry.id} className="min-w-0 space-y-3 border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 flex-1 break-words text-xs text-neutral-700">{laboratorySummary(entry, 160)}</p>
          <div className="flex gap-1"><Button type="button" variant="ghost" size="compact" disabled={disabled} onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}>{editing ? "Close" : "Edit Test"}</Button><Button type="button" variant="ghost" size="compact" disabled={disabled} onClick={() => removeTest(entry)}>Remove Test</Button></div>
        </div>
        {editing && <LaboratoryFields entry={entry} prefix={prefix} errors={errors} disabled={disabled} onChange={next => onChange(tests.map(test => test.id === entry.id ? next : test))} />}
        <LaboratoryAttachments context={{ ...context, testId: entry.id }} disabled={disabled} onBusyChange={onBusyChange} onFilesChange={files => onAttachmentsChange?.(entry.id, files)} />
      </div>;
    })}
  </section>;
}

export function LaboratoryEvidencePicker({ options = [], selected = [], confirmed = false, onChange, disabled = false, error, loading = false, loadError = false, onRefresh }) {
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 border-t border-neutral-200 pt-3">
    <legend className="pt-3 text-xs font-semibold text-ink-900">Relevant Laboratory Evidence</legend>
    <p className="text-xs text-neutral-500">Only selected evidence will be shared with this BHC for this condition.</p>
    {loading && <p role="status" className="text-xs text-neutral-500">Loading laboratory history…</p>}
    {loadError && <p role="alert" className="text-xs text-red-700">Unable to load laboratory history.</p>}
    {onRefresh && <Button type="button" variant="secondary" size="compact" disabled={disabled || loading} onClick={onRefresh}>Refresh Evidence</Button>}
    {!options.length && !loading && <p className="text-xs text-neutral-500">No laboratory tests available to select.</p>}
    <div className="max-h-72 space-y-1 overflow-y-auto">
      {options.map(entry => <label key={entry.reference} className="flex min-w-0 items-start gap-2 py-1 text-xs text-neutral-700">
        <input type="checkbox" disabled={entry.attachmentsReady === false} className="mt-1 shrink-0 accent-brand-600" checked={selected.some(item => item.reference === entry.reference)} onChange={event => onChange(event.target.checked ? [...selected, { reference: entry.reference, version: entry.version, attachmentIds: (entry.attachments || []).map(file => file.id) }] : selected.filter(item => item.reference !== entry.reference), false)} />
        <span className="min-w-0 break-words">{laboratorySummary(entry, 240)}<span className="mt-0.5 block text-neutral-500">{entry.reference.startsWith("current:") ? "This visit" : "Previous RHU visit"}{entry.attachments?.length ? ` · ${entry.attachments.length} attachment(s)` : ""}</span></span>
      </label>)}
    </div>
    {selected.length > 0 && <label className="flex items-start gap-2 text-xs font-medium text-ink-900"><input type="checkbox" disabled={loading || selected.some(item => !options.some(option => option.reference === item.reference && option.attachmentsReady !== false))} className="mt-0.5 shrink-0 accent-brand-600" checked={confirmed} onChange={event => onChange(selected.map(item => {
      const option = options.find(entry => entry.reference === item.reference);
      return option ? { reference: item.reference, version: option.version, attachmentIds: (option.attachments || []).map(file => file.id) } : item;
    }), event.target.checked)} /><span>I confirm sharing these {selected.length} selected laboratory record(s) and their supporting attachments with the receiving BHC.</span></label>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </fieldset>;
}

/** Compact clinical links only — never shares with BHC. Result updates reuse General Examination / addendum flows. */
export function SupportingLaboratoryTestsPicker({
  options = [],
  selected = [],
  onChange,
  disabled = false,
  loading = false,
  loadError = false,
  onRefresh,
  onUpdateCurrentTest,
  canUpdateHistorical = false,
}) {
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const ordered = sortLaboratoryOptionsByRelevance(options);

  function openEditor(entry) {
    setEditing({ ...entry });
    setReason("");
    setError("");
    setFieldErrors({});
  }

  async function saveEditor() {
    if (!editing || busy) return;
    const errors = laboratoryErrors([editing]);
    const remapped = Object.fromEntries(
      Object.entries(errors).map(([key, message]) => [key.replace(/^laboratoryTests\.0/, "laboratoryTests.0"), message]),
    );
    setFieldErrors(remapped);
    if (Object.keys(remapped).length) return;

    const isCurrent = String(editing.reference || "").startsWith("current:");
    if (!isCurrent && !String(reason || "").trim()) {
      setError("Enter a reason for this laboratory result update.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (isCurrent) {
        const next = {
          id: editing.id,
          testName: editing.testName,
          collectionDate: editing.collectionDate || "",
          examinationDate: editing.examinationDate || "",
          resultStatus: editing.resultStatus,
          result: editing.result || "",
        };
        onUpdateCurrentTest?.(next);
      } else {
        const healthRecordId = editing.healthRecordId || editing.health_record_id;
        if (!healthRecordId || !editing.recordId) {
          throw new Error("Unable to locate the source laboratory record.");
        }
        await saveLaboratoryAddendum(healthRecordId, editing, reason.trim());
        await onRefresh?.();
      }
      setEditing(null);
      setReason("");
    } catch (failure) {
      setError(failure.message || "Unable to save laboratory result.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="min-w-0 space-y-2 border-t border-[#E5EEFF] pt-3">
      <legend className="pt-1 text-xs font-semibold text-[#0B1C30]">Supporting Laboratory Tests</legend>
      <p className="text-xs text-[#545F73]">
        Optional. Select existing tests that support this diagnosis. Linking does not mark a result available or share with a BHC.
      </p>
      {loading && <p role="status" className="text-xs text-[#545F73]">Loading laboratory history…</p>}
      {loadError && <p role="alert" className="text-xs text-red-700">Unable to load laboratory history.</p>}
      {onRefresh && (
        <Button type="button" variant="secondary" size="compact" disabled={disabled || loading} onClick={onRefresh} className="rounded-none">
          Refresh Tests
        </Button>
      )}
      {!ordered.length && !loading && (
        <p className="text-xs text-[#545F73]">No laboratory tests available. Add tests under General Examination first.</p>
      )}
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {ordered.map((entry) => {
          const checked = selected.some((item) => item.reference === entry.reference);
          const date = entry.examinationDate || entry.collectionDate || "";
          const isCurrent = String(entry.reference || "").startsWith("current:");
          const canEdit = isCurrent
            ? typeof onUpdateCurrentTest === "function"
            : canUpdateHistorical && Boolean(entry.recordId && (entry.healthRecordId || entry.health_record_id));
          const actionLabel = entry.resultStatus === "Result Available" ? "View / Update Result" : "Update Result";
          return (
            <div key={entry.reference} className="flex min-w-0 items-start gap-2 py-1 text-xs text-[#0B1C30]">
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  disabled={disabled}
                  className="mt-1 shrink-0 accent-[#B70011]"
                  checked={checked}
                  onChange={(event) => onChange(
                    event.target.checked
                      ? [...selected.filter((item) => item.reference !== entry.reference), { reference: entry.reference }]
                      : selected.filter((item) => item.reference !== entry.reference),
                  )}
                />
                <span className="min-w-0 break-words">
                  <span className="font-medium">{entry.testName || "Unnamed test"}</span>
                  <span className="mt-0.5 block text-[#545F73]">
                    {entry.resultStatus || "Requested"}
                    {date ? ` · ${date}` : ""}
                    {isCurrent ? " · This visit" : " · Previous visit"}
                  </span>
                </span>
              </label>
              {canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={disabled || busy}
                  className="shrink-0 rounded-none"
                  onClick={() => openEditor(entry)}
                >
                  {actionLabel}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {editing ? (
        <ModalShell
          open
          title={String(editing.reference || "").startsWith("current:") ? "Laboratory Result" : "Laboratory Result Addendum"}
          size="wide"
          onClose={() => { if (!busy) setEditing(null); }}
        >
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">
              {String(editing.reference || "").startsWith("current:")
                ? "Updates apply to this visit’s laboratory entry in General Examination."
                : "The finalized consultation snapshot stays preserved. This saves an authorized result addendum."}
            </p>
            <LaboratoryFields
              entry={editing}
              prefix="laboratoryTests.0"
              errors={fieldErrors}
              disabled={busy}
              onChange={setEditing}
            />
            {!String(editing.reference || "").startsWith("current:") ? (
              <label className="block text-xs font-medium text-neutral-700">
                Reason *
                <textarea
                  rows={2}
                  value={reason}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm"
                />
              </label>
            ) : null}
            {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="button" variant="brand" disabled={busy} onClick={saveEditor}>
                {busy ? "Saving…" : String(editing.reference || "").startsWith("current:") ? "Save Result" : "Save Addendum"}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </fieldset>
  );
}
