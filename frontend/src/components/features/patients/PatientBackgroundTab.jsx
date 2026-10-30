import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { ArrowRight } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import NoticeModal from "../../common/modals/NoticeModal";
import usePatientConsultation from "../../../hooks/usePatientConsultation";
import { consultationPatientQueryKey } from "../../../services/consultationPatientQuery";
import { savePatientBackground } from "../../../services/patientService";
import { formatLongDate } from "../../../utils/formatters";
import { queryKeys } from "../../../utils/queryKeys";
import { infantHiddenSocialKeys } from "../../../utils/infantVisibility";
import { sectionStatus, sectionVisibility } from "../../../utils/patientHistory";
import {
  BACKGROUND_SECTION_FIELDS,
  BACKGROUND_SECTION_KEYS,
  BACKGROUND_SECTION_LABELS,
  backgroundChangeRows,
} from "../../../utils/backgroundUpdate";
import {
  BHC_HIDDEN_SOCIAL_FIELDS,
  backgroundSaveErrorLines,
  backgroundSavedFeedback,
  consultationBannerVisible,
  isSectionEditDirty,
  resolveSectionConflict,
  sectionConflict,
  sectionSavePayload,
  shouldBlockBackgroundLeave,
  startSectionEdit,
  updateSectionEdit,
} from "../../../utils/backgroundEditing";
import { LegacyPendingConditions, REPORTED_LABEL } from "./MedicalConditionsGroups";
import PatientBackgroundEditor from "./PatientBackgroundEditor";
import { RhuConditions } from "./history/PastMedicalSection";
import { FieldList, ProfileSection, SectionEditActions, TextAction } from "./profile/ProfileSection";

/**
 * "Last reviewed {date} · {facility}", "Recorded {date} (not yet reviewed)"
 * for a section never reviewed, or "Not yet recorded".
 */
function sectionMeta(background, section) {
  const status = sectionStatus({ background, section });
  const date = status.date ? formatLongDate(status.date, "") : "";
  if (status.kind === "recorded") {
    return date ? `Recorded ${date} (not yet reviewed)` : "Recorded (not yet reviewed)";
  }
  if (status.kind !== "lastReviewed") return "Not yet recorded";
  if (!date) return "Last reviewed date not recorded";
  return status.facility ? `Last reviewed ${date} · ${status.facility}` : `Last reviewed ${date}`;
}

function RhuConditionsBlock({ conditions }) {
  return (
    <div className="mb-3">
      <h3 className="mb-1.5 text-[13px] font-semibold text-neutral-900">Current Conditions</h3>
      {conditions?.isLoading && (
        <p role="status" className="mb-2 text-[13px] text-neutral-500">Loading RHU-confirmed conditions...</p>
      )}
      {conditions?.isError && (
        <p role="alert" className="mb-2 text-[13px] text-neutral-500">
          RHU-confirmed conditions could not be loaded right now.
        </p>
      )}
      {!conditions?.isLoading && !conditions?.isError && (
        <div className="space-y-3">
          <RhuConditions groups={conditions?.groups} />
          <LegacyPendingConditions rows={conditions?.groups?.legacyPending} />
        </div>
      )}
    </div>
  );
}

/** The saved values of a section as label/value rows; `hideMoved` drops Education / Past Occupations. */
function SectionFields({ background, section, hideMoved = false, hiddenSocialKeys = [] }) {
  const fields = BACKGROUND_SECTION_FIELDS[section].filter(
    (field) =>
      !(hideMoved && section === "social" && BHC_HIDDEN_SOCIAL_FIELDS.includes(field.key)) &&
      !(section === "social" && hiddenSocialKeys.includes(field.key)),
  );
  return (
    <FieldList
      rows={fields.map((field) => [
        field.key === "currentDiseases" ? REPORTED_LABEL : field.label,
        field.read(background),
      ])}
    />
  );
}

function visibleSections(patient) {
  const visibility = sectionVisibility(patient, new Date());
  return BACKGROUND_SECTION_KEYS.filter((section) => section !== "obstetric" || visibility.obstetric !== "hidden");
}

/**
 * The Patient Background tab: Past Medical, Family, Personal & Social and
 * (for female patients) Obstetric & Menstrual History. A read-only summary of
 * the latest saved chart unless `canEdit` (a BHC user granted
 * clinical.background.update). Visit-specific details stay on Health Records.
 * Education / Past Occupations rows are omitted (Patient Information owns
 * Education). Both views show the Consultation in progress banner while the
 * patient has an open draft.
 */
export default function PatientBackgroundTab({ canEdit = false, ...props }) {
  return canEdit ? <EditableBackground {...props} /> : <ReadOnlyBackground {...props} />;
}

function ReadOnlyBackground({ patientId, patient, background, conditions }) {
  const consultation = usePatientConsultation(patientId);

  return (
    <div>
      {consultationBannerVisible({ draft: consultation.draft }) && (
        <ConsultationBanner consultation={consultation} />
      )}

      {visibleSections(patient).map((section) => (
        <ProfileSection
          key={section}
          id={`background-${section}`}
          title={BACKGROUND_SECTION_LABELS[section]}
          meta={sectionMeta(background, section)}
        >
          {section === "medical" && <RhuConditionsBlock conditions={conditions} />}
          {/* Education is Patient Information; Past Occupations is history only. */}
          <SectionFields
            background={background}
            section={section}
            hideMoved
            hiddenSocialKeys={infantHiddenSocialKeys(patient)}
          />
        </ProfileSection>
      ))}
    </div>
  );
}

/** Shown with an edited section after a 409: latest saved vs. the typed values, and an explicit choice. */
function SectionConflict({ conflict, edit, onResolve, hiddenSocialKeys = [] }) {
  const rows = backgroundChangeRows(conflict.current, edit.value, edit.section).filter(
    (row) =>
      !(edit.section === "social" && BHC_HIDDEN_SOCIAL_FIELDS.includes(row.key)) &&
      !(edit.section === "social" && hiddenSocialKeys.includes(row.key)),
  );
  return (
    <div role="alert" className="mb-4 rounded-lg border border-warning-100 border-l-4 border-l-warning-500 bg-warning-50 p-3">
      <p className="text-[13px] font-semibold text-neutral-900">This section was changed by another save</p>
      <p className="mt-0.5 text-[12.5px] text-neutral-700">
        Your changes are kept below and were not saved. Reload the latest version, or keep your changes and save again.
      </p>
      {rows.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="text-[11px] text-neutral-500">
                <th className="py-1 pr-3 font-medium">Field</th>
                <th className="py-1 pr-3 font-medium">
                  Latest saved{conflict.updatedAt ? ` (${formatLongDate(conflict.updatedAt, "")})` : ""}
                </th>
                <th className="py-1 font-medium">Your changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warning-100 align-top">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="py-1 pr-3 text-neutral-500">{row.label}</td>
                  <td className="py-1 pr-3 text-neutral-900">{row.before || "Not recorded"}</td>
                  <td className="py-1 text-neutral-900">{row.after || "Not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onResolve("latest")}
          className="inline-flex h-8 items-center rounded-lg border border-neutral-300 bg-white px-3 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          Reload latest
        </button>
        <button
          type="button"
          onClick={() => onResolve("mine")}
          className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-ink-700 transition hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          Keep my changes
        </button>
      </div>
    </div>
  );
}

function ConsultationBanner({ consultation }) {
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-neutral-200/80 border-l-4 border-l-brand-600 bg-white px-4 py-2.5 shadow-card"
    >
      <p className="text-sm text-neutral-700">
        <span className="font-semibold text-neutral-900">Consultation in progress</span>
        <span className="text-neutral-500"> · This patient&apos;s consultation is saved and still open.</span>
      </p>
      <button
        type="button"
        onClick={() => consultation.open()}
        disabled={consultation.opening}
        className="inline-flex h-8 items-center gap-1 rounded-lg bg-ink-700 px-3 text-[13px] font-medium text-white shadow-xs transition hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50 focus-visible:ring-offset-1 disabled:bg-ink-300"
      >
        {consultation.opening ? "Opening..." : "Continue Consultation"}
        <ArrowRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function EditableBackground({ patientId, patient, background, conditions }) {
  const queryClient = useQueryClient();
  const consultation = usePatientConsultation(patientId);
  // One section at a time: { section, baseRevision, initial, value }, held
  // apart from the patient query so a refetch never resets typed values.
  const [edit, setEdit] = useState(null);
  const [errors, setErrors] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [savedNotice, setSavedNotice] = useState(null);
  const hiddenSocialKeys = infantHiddenSocialKeys(patient);
  const dirty = isSectionEditDirty(edit, { patient });
  const save = useMutation({ mutationFn: (payload) => savePatientBackground(patientId, payload) });

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    shouldBlockBackgroundLeave({ dirty, currentLocation, nextLocation }),
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function startEdit(section) {
    if (edit) return;
    setEdit(startSectionEdit(background, section));
    setErrors([]);
    setConflict(null);
  }

  function cancelEdit() {
    if (save.isPending) return;
    setEdit(null);
    setErrors([]);
    setConflict(null);
  }

  function resolveConflict(choice) {
    setEdit((current) => resolveSectionConflict(current, conflict, choice));
    setConflict(null);
  }

  async function saveEdit() {
    if (!edit || save.isPending) return;
    if (conflict) {
      setErrors(["Choose Reload latest or Keep my changes first."]);
      return;
    }
    if (!isSectionEditDirty(edit, { patient })) {
      cancelEdit();
      return;
    }
    const { section } = edit;
    setErrors([]);
    try {
      const saved = await save.mutateAsync(sectionSavePayload(edit, { patient }));
      // The PATCH answers with the same serialization as GET /patients/{id}.
      queryClient.setQueryData(queryKeys.patientDetails("bhc", patientId), saved);
      setEdit(null);
      setConflict(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.patientBackgroundHistory(patientId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.patients("bhc") }),
        queryClient.invalidateQueries({ queryKey: consultationPatientQueryKey(patientId) }),
      ]);
      const feedback = backgroundSavedFeedback({ draft: consultation.draft, section });
      if (feedback.kind === "modal") setSavedNotice(feedback);
      else toast.success(feedback.message);
    } catch (error) {
      const found = sectionConflict(error, section);
      if (found) {
        // Keep the typed values; refresh the saved view so it shows the latest.
        setConflict(found);
        void queryClient.invalidateQueries({ queryKey: queryKeys.patientDetails("bhc", patientId) });
        return;
      }
      setErrors(backgroundSaveErrorLines(error));
    }
  }

  const sectionActions = (section) =>
    edit?.section === section ? (
      <SectionEditActions saving={save.isPending} onCancel={cancelEdit} onSave={saveEdit} />
    ) : (
      <TextAction
        onClick={() => startEdit(section)}
        disabled={Boolean(edit)}
        title={edit ? "Save or cancel the section you are editing first" : undefined}
        aria-label={`Edit ${BACKGROUND_SECTION_LABELS[section]}`}
      >
        Edit
      </TextAction>
    );

  const closeSavedNotice = () => setSavedNotice(null);
  const leavingLabel = edit ? BACKGROUND_SECTION_LABELS[edit.section] : "This section";

  return (
    <div>
      {consultationBannerVisible({ draft: consultation.draft }) && (
        <ConsultationBanner consultation={consultation} />
      )}

      {visibleSections(patient).map((section) => {
        const editing = edit?.section === section;
        return (
          <ProfileSection
            key={section}
            id={`background-${section}`}
            title={BACKGROUND_SECTION_LABELS[section]}
            meta={editing ? "Editing" : sectionMeta(background, section)}
            actions={sectionActions(section)}
            className={editing ? "border-brand-200 ring-1 ring-brand-100" : undefined}
          >
            {editing ? (
              <div>
                {errors.length > 0 && (
                  <div role="alert" className="mb-4 rounded-lg border border-alert-200 border-l-4 border-l-alert-600 bg-alert-50 p-3">
                    <p className="text-[13px] font-semibold text-alert-700">This section was not saved</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-alert-700">
                      {errors.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {conflict && (
                  <SectionConflict
                    conflict={conflict}
                    edit={edit}
                    onResolve={resolveConflict}
                    hiddenSocialKeys={hiddenSocialKeys}
                  />
                )}
                <PatientBackgroundEditor
                  section={section}
                  value={edit.value}
                  onChange={(value) => setEdit((current) => updateSectionEdit(current, value))}
                  patient={patient}
                  conditions={conditions}
                />
              </div>
            ) : (
              <>
                {section === "medical" && <RhuConditionsBlock conditions={conditions} />}
                <SectionFields
                  background={background}
                  section={section}
                  hideMoved
                  hiddenSocialKeys={hiddenSocialKeys}
                />
              </>
            )}
          </ProfileSection>
        );
      })}

      <NoticeModal
        open={Boolean(savedNotice)}
        title={savedNotice?.title}
        message={savedNotice?.message}
        onClose={closeSavedNotice}
        actions={[
          { label: "Stay on Background", variant: "secondary", onClick: closeSavedNotice },
          { label: "Continue Consultation", variant: "primary", onClick: () => consultation.open() },
        ]}
      />
      <NoticeModal
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        message={`${leavingLabel} has unsaved changes. If you leave now, they will be lost.`}
        onClose={() => {}}
        dismissOnBackdrop={false}
        actions={[
          { label: "Keep Editing", variant: "secondary", onClick: () => blocker.reset?.() },
          { label: "Discard Changes", variant: "destructive", onClick: () => blocker.proceed?.() },
        ]}
      />
    </div>
  );
}
