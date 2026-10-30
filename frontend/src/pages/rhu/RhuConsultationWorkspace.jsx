import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { Card } from "../../components/ui/card";
import "../../components/features/health-records/wizard/consultation-ehr.css";
import { SuccessModal } from "../../components/common";
import PatientHistoryPanel from "../../components/features/patients/history/PatientHistoryPanel";
import InterviewVisitQuestions from "../../components/features/health-records/wizard/InterviewVisitQuestions";
import BodyPreviewPanel, { BodyFindingsList } from "../../components/features/health-records/wizard/BodyPreviewPanel";
import ConsultationProgramPanel from "../../components/features/health-records/wizard/ConsultationProgramPanel";
import PrenatalAssessmentForm from "../../components/features/health-records/PrenatalAssessmentForm";
import {
  ConsultationActionBar,
  ConsultationStepHeading,
  ConsultationWorkspaceBody,
} from "../../components/features/health-records/wizard/ConsultationWorkflow";
import { ConsultationReviewStep } from "../../components/features/health-records/wizard/HealthRecordWizardSteps";
import ImmunizationVisitFields from "../../components/features/health-records/ImmunizationVisitFields";
import RhuDiagnosisCarePlanSection from "../../components/features/health-records/wizard/RhuDiagnosisCarePlanSection";
import TbTreatmentCardForm, {
  EMPTY_TB_DATA,
  normalizeTbData,
} from "../../components/features/health-records/TbTreatmentCardForm";
import { formatBodyFindings, normalizeBodyFindings } from "../../utils/bodyFindings";
import { summarizeBodyFindings, BODY_FINDING_STATUS_LABELS } from "../../utils/bodyFindingsSummary";
import { PreviousBodyFindings } from "../../components/features/health-records/BodyFindingReassessment";
import { compactReviewSections, patientReviewRow, programReviewRows } from "../../utils/consultationReview";
import {
  PROGRAM_CLASSIFICATIONS,
  getConsultationPrograms,
  lockProgramsWhilePatientLoads,
  programEnrollLabel,
  restoredClassification,
  toggleConsultationProgram,
} from "../../utils/consultationPrograms";
import {
  EMPTY_MATERNAL_DATA,
  applyRiskFactorChange,
  collectPrenatalHistory,
  applyPregnancyDating,
  mergeMaternalData,
  sanitizeRiskAssessment,
  thisVisitDoseEntry,
  maternalReviewFields,
  withLaboratoryEntries,
} from "../../utils/prenatalForm";
import {
  MATERNAL_CARE_MALE_ELIGIBILITY,
  getPrenatalEnrollment,
  prenatalProgramCopy,
} from "../../utils/prenatalEnrollment";
import { applyRiskFlags, getMaternalRiskFlags } from "../../utils/maternalRisk";
import { isPatientMale } from "../../utils/programApplicability";
import { getLatestRecordedHeight } from "../../utils/currentPatientVitals";
import {
  ASSESSMENT_STEP,
  EXIT_STEP,
  INTERVIEW_STEP,
  NEXT_STEP,
  REVIEW_STEP,
  RHU_ITR_STEP_OPTIONS,
  TB_INTAKE_STEP,
  buildConsultationSteps,
  findFirstErrorStepKey,
  getFormSequence,
  getGlobalStepKey,
  getNextStepKey,
  getPreviousStepKey,
  getProgramFormSteps,
  getStepOrder,
  programStepKey,
  remapServerErrorKeys,
  resolveFormStep,
  resolveRestoredPosition,
  resolveStepHeading,
} from "../../utils/consultationSteps";
import { entryPurposeKey, followUpScheduleErrors, restoreFollowUpSchedules } from "../../utils/followUpSchedules";
import {
  diagnosesForRhuSave,
  diagnosisNextAction,
  rhuCarePlanErrors,
  restoreRhuDiagnoses,
  restoreRhuFollowUpSchedules,
} from "../../utils/rhuCarePlan";
import {
  diagnosesOpenDsTbTreatmentCard,
  existingRegisteredTbCase,
  isRecognizedTbDiagnosis,
  tbCaseNumberRequired,
} from "../../utils/rhuTbCaseManagement";
import { focusedRhuFollowUp } from "../../utils/rhuFollowUpFocus";
import { applyServiceNextAction, pruneServiceSchedules } from "../../utils/serviceNextActions";
import { getPatientConditions } from "../../services/patientConditionService";
import { defaultInformant } from "../../utils/patientHistory";
import {
  overlayBackgroundUpdate,
  restoreBackgroundUpdate,
  toDraftBackgroundUpdate,
  toRecordBackgroundUpdate,
} from "../../utils/backgroundUpdate";
import { resolveHistoricalFpMethod } from "../../utils/familyPlanning";
import { backgroundUpdateErrors as stagedHistoryErrors } from "../../utils/backgroundValidation";
import { omitHiddenSocialFromUpdate } from "../../utils/backgroundEditing";
import { calculateBmi, formatBmi } from "../../utils/bmi";
import { shouldShowBmiDisplay, visibleConsultationPrograms } from "../../utils/infantVisibility";
import { areVitalSignsBlank, EMPTY_VITALS_REMINDER, vitalSignsErrors } from "../../utils/vitalSigns";
import {
  historyErrorMessages,
  visitAnswerDraftFields,
  visitAnswerErrorMessages,
  visitAnswerRecordFields,
  visitAnswerRows,
} from "../../utils/historyStep";
import { formatPatientName } from "../../utils/formatters";
import { createIdempotencyKey } from "../../utils/idempotency";
import { RHU_DRAFTS_ENABLED } from "../../utils/featureFlags";
import useDraftAutosave from "../../hooks/useDraftAutosave";
import useClinicalRegistry from "../../hooks/useClinicalRegistry";
import { getConsultationPatientQuery } from "../../services/consultationPatientQuery";
import { listHealthRecordDrafts, getHealthRecordDraft } from "../../services/healthRecordDraftService";
import { createRhuHealthRecord, getHealthRecordsByPatient } from "../../services/healthRecordService";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import { listCatchmentBhcs, listRhuVisits } from "../../services/rhuVisitService";
import useAccess from "../../hooks/useAccess";

function restorePrescriptionText(payload = {}) {
  const text = String(payload.prescriptionText || "");
  if (text.trim()) return text;
  return (Array.isArray(payload.prescribedMedicines) ? payload.prescribedMedicines : [])
    .map((line) => {
      const name = line.medicineName || line.name || "";
      const qty = [line.quantity, line.unit].filter(Boolean).join(" ");
      const instructions = line.instructions || "";
      return [name, qty, instructions].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .join("\n");
}

const WIZARD_FORM = "form";
const WIZARD_NEXT = "next";
const WIZARD_REVIEW = "review";
const EMPTY_HEALTH_RECORDS = [];
const CHILD_VACCINE_OPTIONS = [
  "BCG",
  "Hepatitis B",
  "Pentavalent",
  "OPV",
  "IPV",
  "PCV",
  "MMR",
];

export default function RhuConsultationWorkspace() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const access = useAccess();
  const canEncode = access.can("consultations.encode");
  const canFinalize = access.can("consultations.finalize");
  const canViewBackground = access.can("clinical.history");
  const visitId = Number(params.get("visitId") || 0) || null;
  const patientId = String(params.get("patientId") || "");
  const followUpTaskId = Number(params.get("followUpTaskId") || 0) || null;

  const [visit, setVisit] = useState(null);
  const [visitError, setVisitError] = useState("");
  const [wizardPhase, setWizardPhase] = useState(WIZARD_FORM);
  const [formStep, setFormStep] = useState(canEncode ? INTERVIEW_STEP : NEXT_STEP);
  const [nextScreen, setNextScreen] = useState(NEXT_STEP);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [summaryOfPresentIllness, setSummaryOfPresentIllness] = useState("");
  const [informant, setInformant] = useState(null);
  const [similarIllness, setSimilarIllness] = useState(null);
  const [backgroundUpdate, setBackgroundUpdate] = useState(null);
  const [systolicBp, setSystolicBp] = useState("");
  const [diastolicBp, setDiastolicBp] = useState("");
  const [temp, setTemp] = useState("");
  const [pulse, setPulse] = useState("");
  const [spo2, setSpo2] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [fbs, setFbs] = useState("");
  const [physicalExam, setPhysicalExam] = useState("");
  const [bodyFindings, setBodyFindings] = useState([]);
  const [bodyFindingReassessments, setBodyFindingReassessments] = useState([]);
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [primaryProgram, setPrimaryProgram] = useState("");
  const [tbData, setTbData] = useState(EMPTY_TB_DATA);
  const [conditionReferences, setConditionReferences] = useState([]);
  const followUpFocusApplied = useRef(false);
  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");
  const [familyPlanningData, setFamilyPlanningData] = useState({ clientType: "", methodUsed: "", actionTaken: "" });
  const [immunizationEntries, setImmunizationEntries] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [prescriptionText, setPrescriptionText] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [followUpSchedules, setFollowUpSchedules] = useState([]);
  const [catchmentBhcs, setCatchmentBhcs] = useState([]);
  const [openConditions, setOpenConditions] = useState([]);
  const [linkedFollowUpTaskId, setLinkedFollowUpTaskId] = useState(followUpTaskId);
  const [parentHealthRecordId, setParentHealthRecordId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [bodyDialog, setBodyDialog] = useState(null);
  const [bodyPreviewSide, setBodyPreviewSide] = useState("front");
  const { registry } = useClinicalRegistry();

  const patientQuery = useQuery({
    ...getConsultationPatientQuery(patientId),
    enabled: Boolean(patientId),
  });
  const patient = patientQuery.data || null;
  const recordsQuery = useQuery({
    queryKey: ["rhu-consultation-records", patientId],
    queryFn: () => getHealthRecordsByPatient(patientId),
    enabled: Boolean(patientId) && canViewBackground,
  });
  const patientRecords = recordsQuery.data ?? EMPTY_HEALTH_RECORDS;
  const previousBodyFindings = useMemo(() => summarizeBodyFindings(patientRecords, "ongoing").findings, [patientRecords]);
  function changeBodyReassessments(next) {
    setBodyFindingReassessments(next);
    setValidationErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("monitoring_data.bodyFindingReassessments"))));
  }
  const prenatalEnrollment = useMemo(
    () => getPrenatalEnrollment(patient || {}, patientRecords),
    [patient, patientRecords],
  );
  const prenatalHistory = useMemo(
    () => collectPrenatalHistory(patientRecords),
    [patientRecords],
  );
  const historicalFpMethod = useMemo(
    () => resolveHistoricalFpMethod({
      background: overlayBackgroundUpdate(patient?.medicalBackground, backgroundUpdate),
      maternalData,
      records: patientRecords,
    }),
    [patient?.medicalBackground, backgroundUpdate, maternalData, patientRecords],
  );
  const prenatalIntent = selectedPrograms.includes("Maternal") ? prenatalEnrollment.intent : "";

  useEffect(() => {
    let cancelled = false;
    async function loadVisit() {
      try {
        const visits = await listRhuVisits();
        const match = visits.find((entry) => {
          if (visitId && Number(entry.id) === Number(visitId)) return true;
          return (
            !visitId &&
            String(entry.patient?.id || entry.patient_id) === String(patientId) &&
            entry.status === "in_consultation"
          );
        });
        if (cancelled) return;
        if (!match || match.status !== "in_consultation") {
          setVisitError("Start this consultation from Today's Queue.");
          return;
        }
        setVisit(match);
        setVisitError("");
      } catch (error) {
        if (!cancelled) setVisitError(error?.message || "Unable to load this visit.");
      }
    }
    loadVisit();
    return () => {
      cancelled = true;
    };
  }, [visitId, patientId]);

  useEffect(() => {
    if (!canFinalize) return;
    listCatchmentBhcs()
      .then((rows) => setCatchmentBhcs(Array.isArray(rows) ? rows : []))
      .catch(() => setCatchmentBhcs([]));
  }, [canFinalize]);

  useEffect(() => {
    if (!patientId || !canViewBackground) return;
    getPatientConditions(patientId)
      .then((payload) => setOpenConditions(payload?.conditions || []))
      .catch(() => setOpenConditions([]));
  }, [patientId, canViewBackground]);

  useEffect(() => {
    if (informant || !patient) return;
    setInformant(defaultInformant(patient, new Date()));
  }, [patient, informant]);

  const pregnancyDatingRef = useRef({ autoEdd: "", autoAog: "" });
  useEffect(() => {
    const next = applyPregnancyDating({
      lmp: maternalData.lmp,
      edc: expectedDeliveryDate,
      aog,
      visitDate: new Date(),
      previousAutoEdd: pregnancyDatingRef.current.autoEdd,
      previousAutoAog: pregnancyDatingRef.current.autoAog,
    });
    pregnancyDatingRef.current = { autoEdd: next.autoEdd, autoAog: next.autoAog };
    if (next.edc !== expectedDeliveryDate) setExpectedDeliveryDate(next.edc);
    if (next.aog !== aog) setAog(next.aog);
  }, [maternalData.lmp, expectedDeliveryDate, aog]);

  useEffect(() => {
    if (selectedPrograms.includes("Maternal")) applyPrenatalPrefill();
  }, [prenatalEnrollment.prefill, selectedPrograms]);

  useEffect(() => {
    if (!selectedPrograms.includes("Maternal") || !weight || !height) return;
    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);
    if (!Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight)) return;
    if (parsedWeight <= 0 || parsedHeight <= 0) return;
    const heightInMeters = parsedHeight / 100;
    const nextBmi = (parsedWeight / (heightInMeters * heightInMeters)).toFixed(1);
    setMaternalData((prev) => (prev.bmi === nextBmi ? prev : { ...prev, bmi: nextBmi }));
  }, [height, selectedPrograms, weight]);

  useEffect(() => {
    followUpFocusApplied.current = false;
    setConditionReferences([]);
  }, [followUpTaskId]);

  useEffect(() => {
    if (!followUpTaskId || !patientId) return;
    getFollowUpTasks({ patient_id: patientId, active: true })
      .then((tasks) => {
        const match = tasks.find((task) => Number(task.id) === Number(followUpTaskId));
        if (!match) return;
        setLinkedFollowUpTaskId(Number(match.id));
        const parentId = Number(match.healthRecordId || match.originalHealthRecordId) || null;
        setParentHealthRecordId(parentId);
        const parentRecord = (patientRecords || []).find((record) => Number(record.id) === parentId) || null;
        const focus = focusedRhuFollowUp({
          task: match,
          parentRecord,
          conditions: openConditions,
        });
        setConditionReferences(focus.references);
        if (focus.diagnoses.length && !followUpFocusApplied.current) {
          setDiagnoses((current) => (current.length ? current : focus.diagnoses));
          followUpFocusApplied.current = true;
        }
      })
      .catch(() => {});
  }, [followUpTaskId, patientId, patientRecords, openConditions]);

  const consultationUuid = visit?.consultation_uuid || visit?.consultationUuid || "";
  const existingTbCase = useMemo(() => existingRegisteredTbCase(patientRecords), [patientRecords]);
  const includeTb = useMemo(() => {
    if (diagnosesOpenDsTbTreatmentCard(diagnoses)) return true;
    return Boolean(existingTbCase) && diagnoses.some((entry) => isRecognizedTbDiagnosis(entry.name, registry));
  }, [diagnoses, existingTbCase, registry]);
  useEffect(() => {
    if (!existingTbCase?.tbData) return;
    setTbData((current) => {
      if (String(current?.diagnosis?.tbCaseNumber || "").trim()) return current;
      return normalizeTbData(existingTbCase.tbData);
    });
  }, [existingTbCase]);
  const programFormSteps = useMemo(
    () => getProgramFormSteps(selectedPrograms, primaryProgram),
    [selectedPrograms, primaryProgram],
  );
  const stepOptions = { ...RHU_ITR_STEP_OPTIONS, includeTb };
  const consultationSteps = useMemo(
    () => buildConsultationSteps({ programSteps: programFormSteps, ...stepOptions }),
    [programFormSteps, includeTb],
  );
  const formSequence = useMemo(
    () => getFormSequence(programFormSteps, stepOptions),
    [programFormSteps, includeTb],
  );
  const stepOrder = useMemo(
    () => getStepOrder(programFormSteps, [], stepOptions),
    [programFormSteps, includeTb],
  );
  const activeFormStep = resolveFormStep(formStep, formSequence, programFormSteps);
  const currentGlobalStepKey =
    wizardPhase === WIZARD_REVIEW ? REVIEW_STEP : wizardPhase === WIZARD_NEXT ? nextScreen : getGlobalStepKey(activeFormStep);
  const currentStepKey =
    wizardPhase === WIZARD_REVIEW ? REVIEW_STEP : wizardPhase === WIZARD_NEXT ? nextScreen : activeFormStep;
  const encodeLocked = !canEncode;
  const finalizeLocked = !canFinalize;
  const assessmentLocked = encodeLocked;
  const clinicalLocked = finalizeLocked;

  const draftPayload = useMemo(
    () => ({
      wizardPhase: wizardPhase === WIZARD_REVIEW ? REVIEW_STEP : wizardPhase,
      formStep: activeFormStep,
      chiefComplaint,
      summaryOfPresentIllness,
      ...visitAnswerDraftFields({ informant, similarIllness, allowed: canViewBackground }),
      backgroundUpdate: canViewBackground
        ? toDraftBackgroundUpdate(omitHiddenSocialFromUpdate(backgroundUpdate, patient, new Date(), { includeBhcProfileFields: false }))
        : undefined,
      systolicBp,
      diastolicBp,
      temp,
      pulse,
      spo2,
      weight,
      height,
      fbs,
      physicalExam,
      bodyFindings,
      bodyFindingReassessments,
      selectedPrograms,
      primaryProgram,
      includeTb,
      tbData: includeTb ? tbData : null,
      maternalData: {
        ...maternalData,
        ...withLaboratoryEntries(maternalData.laboratoryEntries),
      },
      expectedDeliveryDate,
      aog,
      prenatalIntent,
      familyPlanningData,
      immunizationData: { vaccineEntries: immunizationEntries },
      diagnoses,
      prescriptionText,
      medication: treatmentNotes,
      followUpSchedules,
      rhuFollowUp: diagnoses.some((entry) => diagnosisNextAction(entry) === "rhu_follow_up") || followUpSchedules.some((item) => item.purposeKey === "visit"),
      manageToBhc: diagnoses.some((entry) => diagnosisNextAction(entry) === "manage_to_bhc"),
      consultationWorkflow: "rhu_itr_v1",
      followUpDate: followUpSchedules[0]?.date || "",
      followUpTime: followUpSchedules[0]?.time || "",
      followUpReason: followUpSchedules[0]?.purpose || "",
      rhuVisitId: visit?.id,
    }),
    [
      wizardPhase,
      activeFormStep,
      chiefComplaint,
      summaryOfPresentIllness,
      informant,
      similarIllness,
      canViewBackground,
      backgroundUpdate,
      systolicBp,
      diastolicBp,
      temp,
      pulse,
      spo2,
      weight,
      height,
      fbs,
      physicalExam,
      bodyFindings,
      bodyFindingReassessments,
      selectedPrograms,
      primaryProgram,
      includeTb,
      tbData,
      maternalData,
      expectedDeliveryDate,
      aog,
      prenatalIntent,
      familyPlanningData,
      immunizationEntries,
      diagnoses,
      prescriptionText,
      treatmentNotes,
      followUpSchedules,
      visit?.id,
    ],
  );

  const autosave = useDraftAutosave({
    enabled: RHU_DRAFTS_ENABLED && Boolean(patientId && consultationUuid && visit?.id) && (canEncode || canFinalize),
    patientId,
    classification: restoredClassification("General Consultation", primaryProgram),
    payload: draftPayload,
    draft: activeDraft,
    sectionKey: currentStepKey,
    consultationUuid,
    rhuVisitId: visit?.id,
    onDraftSaved: (saved) => setActiveDraft((current) => ({ ...current, ...saved })),
  });

  useEffect(() => {
    if (!RHU_DRAFTS_ENABLED || !consultationUuid || activeDraft) return;
    let cancelled = false;
    listHealthRecordDrafts()
      .then((drafts) => drafts.find((draft) => String(draft.consultationUuid).toLowerCase() === String(consultationUuid).toLowerCase()))
      .then((match) => (match ? getHealthRecordDraft(match.id) : null))
      .then((draft) => {
        if (cancelled || !draft) return;
        restoreDraft(draft);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [consultationUuid, activeDraft]);

  function restoreDraft(draft) {
    const payload = draft.payload || {};
    setActiveDraft(draft);
    setChiefComplaint(payload.chiefComplaint || "");
    setSummaryOfPresentIllness(payload.summaryOfPresentIllness || "");
    if (payload.informant) setInformant(payload.informant);
    if (payload.similarIllness) setSimilarIllness(payload.similarIllness);
    setBackgroundUpdate(restoreBackgroundUpdate(payload.backgroundUpdate));
    setSystolicBp(payload.systolicBp || "");
    setDiastolicBp(payload.diastolicBp || "");
    setTemp(payload.temp || "");
    setPulse(payload.pulse || "");
    setSpo2(payload.spo2 || "");
    setWeight(payload.weight || "");
    setHeight(payload.height || "");
    setFbs(payload.fbs || "");
    setPhysicalExam(payload.physicalExam || "");
    setBodyFindings(normalizeBodyFindings(payload.bodyFindings));
    setBodyFindingReassessments(Array.isArray(payload.bodyFindingReassessments) ? payload.bodyFindingReassessments : []);
    const programs = getConsultationPrograms(payload);
    setSelectedPrograms(programs);
    setPrimaryProgram(payload.primaryProgram || programs[0] || "");
    if (payload.tbData) setTbData(normalizeTbData(payload.tbData));
    if (payload.maternalData) setMaternalData((current) => mergeMaternalData(payload.maternalData, current));
    if (payload.expectedDeliveryDate) setExpectedDeliveryDate(payload.expectedDeliveryDate);
    if (payload.aog) setAog(payload.aog);
    if (payload.familyPlanningData) setFamilyPlanningData((current) => ({ ...current, ...payload.familyPlanningData }));
    if (payload.immunizationData?.vaccineEntries) setImmunizationEntries(payload.immunizationData.vaccineEntries);
    const restoredDiagnoses = restoreRhuDiagnoses(payload);
    setDiagnoses(restoredDiagnoses);
    setPrescriptionText(restorePrescriptionText(payload));
    setTreatmentNotes(payload.medication || "");
    const restoredSchedules = restoreFollowUpSchedules(payload.followUpSchedules);
    setFollowUpSchedules(restoredSchedules.length ? restoredSchedules : restoreRhuFollowUpSchedules(payload, restoredDiagnoses));
    const restored = resolveRestoredPosition(payload, stepOptions);
    if (restored.phase === REVIEW_STEP || restored.phase === "review") {
      setWizardPhase(WIZARD_REVIEW);
    } else if (restored.phase === "next") {
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(canFinalize ? NEXT_STEP : NEXT_STEP);
    } else {
      setWizardPhase(WIZARD_FORM);
      setFormStep(!canEncode && canFinalize ? NEXT_STEP : restored.formStep || INTERVIEW_STEP);
      if (!canEncode && canFinalize) {
        setWizardPhase(WIZARD_NEXT);
        setNextScreen(NEXT_STEP);
      }
    }
  }

  const monitoredNames = useMemo(
    () => Object.values(registry?.monitored_conditions || {}).map((item) => item.name || item.label).filter(Boolean),
    [registry],
  );

  function clearError(key) {
    setValidationErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function clearErrorsStartingWith(prefixes) {
    setValidationErrors((current) => {
      const keys = Object.keys(current).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
      if (!keys.length) return current;
      const next = { ...current };
      keys.forEach((key) => delete next[key]);
      return next;
    });
  }

  function historyUpdateForSave() {
    return omitHiddenSocialFromUpdate(backgroundUpdate, patient, new Date(), { includeBhcProfileFields: false });
  }

  function validateCurrent() {
    const errors = {};
    if (currentStepKey === INTERVIEW_STEP) {
      if (!String(chiefComplaint).trim()) {
        errors.chiefComplaint = "Chief complaint is required.";
      }
      if (canViewBackground) {
        Object.assign(errors, stagedHistoryErrors(historyUpdateForSave(), { sections: ["family", "medical", "social"] }));
      }
    }
    if (currentStepKey === ASSESSMENT_STEP) {
      Object.assign(errors, vitalSignsErrors({ systolicBp, diastolicBp, pulse, spo2, temp, weight, height, fbs }));
    }
    if (currentStepKey === programStepKey("Maternal") && selectedPrograms.includes("Maternal")) {
      if (prenatalIntent === "enroll" && !String(maternalData.lmp || "").trim()) {
        errors["maternalData.lmp"] = "Record the last menstrual period to enroll in Maternal Care.";
      }
      if (canViewBackground) {
        Object.assign(errors, stagedHistoryErrors(historyUpdateForSave(), { sections: ["obstetric"] }));
      }
    }
    if (includeTb && currentStepKey === TB_INTAKE_STEP && canFinalize) {
      if (tbCaseNumberRequired(diagnoses, existingTbCase) && !String(tbData.diagnosis?.tbCaseNumber || "").trim()) {
        errors["tbData.diagnosis.tbCaseNumber"] = "TB case number is required to register this DS-TB treatment case.";
      }
    }
    if (currentStepKey === NEXT_STEP && canFinalize) {
      Object.assign(errors, rhuCarePlanErrors(diagnoses, {
        schedules: followUpSchedules,
        catchmentBhcIds: catchmentBhcs.map((bhc) => bhc.id),
        isReferralVisit: visit?.source === "referral",
        conditions: openConditions,
      }));
      Object.assign(errors, followUpScheduleErrors({ extraSchedules: followUpSchedules }));
    }
    setValidationErrors(errors);
    return errors;
  }

  function goToStepKey(key) {
    if (key === REVIEW_STEP) {
      setWizardPhase(WIZARD_REVIEW);
      return;
    }
    if (key === NEXT_STEP) {
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(NEXT_STEP);
      return;
    }
    setWizardPhase(WIZARD_FORM);
    setFormStep(key);
  }

  function handlePrevious() {
    if (wizardPhase === WIZARD_REVIEW) {
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(includeTb ? TB_INTAKE_STEP : NEXT_STEP);
      return;
    }
    if (wizardPhase === WIZARD_NEXT) {
      if (nextScreen === TB_INTAKE_STEP) {
        setNextScreen(NEXT_STEP);
        return;
      }
      const previous = getPreviousStepKey(formSequence, formSequence[formSequence.length - 1]);
      setWizardPhase(WIZARD_FORM);
      setFormStep(previous === EXIT_STEP ? INTERVIEW_STEP : previous);
      return;
    }
    const previous = getPreviousStepKey(formSequence, activeFormStep);
    if (previous === EXIT_STEP) {
      navigate("/rhu/patients");
      return;
    }
    setFormStep(previous);
  }

  function handleContinue() {
    const errors = validateCurrent();
    if (Object.keys(errors).length) return;
    if (wizardPhase === WIZARD_REVIEW) {
      if (!canFinalize) {
        toast.error("This account cannot finalize the consultation.");
        return;
      }
      void saveRecord();
      return;
    }
    if (wizardPhase === WIZARD_NEXT) {
      if (nextScreen === NEXT_STEP && includeTb) {
        setNextScreen(TB_INTAKE_STEP);
        return;
      }
      setWizardPhase(WIZARD_REVIEW);
      return;
    }
    const next = getNextStepKey(formSequence, activeFormStep);
    if (next === NEXT_STEP) {
      if (!canFinalize) {
        toast.success("Assessment saved. A clinician with finalize access can diagnose and close this visit.");
        navigate("/rhu/patients");
        return;
      }
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(NEXT_STEP);
      return;
    }
    setFormStep(next);
  }

  function handleMaternalChange(field, value) {
    clearError(`maternalData.${field}`);
    setMaternalData((prev) => ({ ...prev, [field]: value }));
  }

  function handleNestedMaternalChange(group, field, value) {
    setMaternalData((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || EMPTY_MATERNAL_DATA[group] || {}),
        [field]: value,
      },
    }));
  }

  function handleRiskAssessmentChange(key, checked) {
    setMaternalData((previous) => ({
      ...previous,
      riskAssessment: applyRiskFactorChange(previous.riskAssessment, key, checked),
    }));
  }

  function applyPrenatalPrefill() {
    if (!prenatalEnrollment.enrolled || !prenatalEnrollment.prefill) return;
    setMaternalData((current) => (current.lmp ? current : prenatalEnrollment.prefill));
    const prefill = prenatalEnrollment.prefill;
    if (prefill.expectedDeliveryDate) setExpectedDeliveryDate(prefill.expectedDeliveryDate);
    if (prefill.aog) setAog(prefill.aog);
  }

  function handleDiagnosisChange(next) {
    setDiagnoses((current) => current.map((row) => (row.id === next.id ? next : row)));
    const action = diagnosisNextAction(next);
    const purposeKey = entryPurposeKey(next.id);
    setFollowUpSchedules((current) => {
      const rest = current.filter((item) => item.purposeKey !== purposeKey);
      if (action !== "rhu_follow_up") return rest;
      const existing = current.find((item) => item.purposeKey === purposeKey);
      return [...rest, existing || {
        purposeKey,
        purpose: next.name || "RHU follow-up",
        date: "",
        time: "",
        predecessorTaskId: null,
        sourceEntryId: next.id,
      }];
    });
  }

  function handleDiagnosisFollowUp(entryId, next) {
    const purposeKey = entryPurposeKey(entryId);
    setFollowUpSchedules((current) => {
      const rest = current.filter((item) => item.purposeKey !== purposeKey);
      if (!next) return rest;
      return [...rest, {
        purposeKey,
        purpose: next.purpose || "",
        date: next.date || "",
        time: next.time || "",
        predecessorTaskId: null,
        sourceEntryId: entryId,
      }];
    });
  }

  function handleRemoveDiagnosis(id) {
    setDiagnoses((current) => current.filter((row) => row.id !== id));
    const purposeKey = entryPurposeKey(id);
    setFollowUpSchedules((current) => current.filter((item) => item.purposeKey !== purposeKey));
  }

  function handleServiceNextAction(program, action) {
    setFollowUpSchedules((current) => pruneServiceSchedules(applyServiceNextAction(program, action, current), selectedPrograms));
  }

  function handleServiceFollowUp(program, next) {
    handleServiceNextAction(program, "schedule");
    const purposeKey = `service:${String(program || "").trim().toLowerCase().replace(/\s+/g, "-")}`;
    setFollowUpSchedules((current) => current.map((item) => (
      item.purposeKey === purposeKey
        ? { ...item, purpose: next.purpose || item.purpose, date: next.date || "", time: next.time || "" }
        : item
    )));
  }

  function handleProgramSelect(key) {
    if (key === "Maternal" && (!patient || isPatientMale(patient))) return;
    const next = toggleConsultationProgram(selectedPrograms, primaryProgram, key);
    setSelectedPrograms(next.selectedPrograms);
    setPrimaryProgram(next.primaryProgram);
    if (key === "Maternal" && next.selectedPrograms.includes("Maternal")) {
      applyPrenatalPrefill();
    }
  }

  function buildRhuMaternalPayload() {
    const thisVisitImmunization = {
      ...EMPTY_MATERNAL_DATA.immunizationThisVisit,
      ...(maternalData.immunizationThisVisit || {}),
    };
    const riskFlags = getMaternalRiskFlags({
      birthdate: patient?.birthdate || patient?.birthDate || patient?.dateOfBirth,
      visitHeight: height,
      recordedHeight: getLatestRecordedHeight(patientRecords),
      referenceDate: new Date(),
    });
    return {
      ...mergeMaternalData(maternalData),
      ...withLaboratoryEntries(maternalData.laboratoryEntries),
      expectedDeliveryDate,
      aog,
      previousFpMethodUsed: historicalFpMethod.method || maternalData.previousFpMethodUsed || "",
      previous_fp_method_used: historicalFpMethod.method || maternalData.previousFpMethodUsed || "",
      previousFpMethodOther: historicalFpMethod.other || maternalData.previousFpMethodOther || "",
      previous_fp_method_other: historicalFpMethod.other || maternalData.previousFpMethodOther || "",
      riskAssessment: applyRiskFlags(
        {
          ...EMPTY_MATERNAL_DATA.riskAssessment,
          ...sanitizeRiskAssessment(maternalData.riskAssessment),
        },
        riskFlags,
      ),
      immunizationThisVisit: thisVisitImmunization,
      tetanusToxoidStatus: {
        ...EMPTY_MATERNAL_DATA.tetanusToxoidStatus,
        ...(maternalData.tetanusToxoidStatus || {}),
        ...thisVisitDoseEntry(thisVisitImmunization, "tetanusToxoidStatus"),
      },
      tetanusDiphtheriaStatus: {
        ...EMPTY_MATERNAL_DATA.tetanusDiphtheriaStatus,
        ...(maternalData.tetanusDiphtheriaStatus || {}),
        ...thisVisitDoseEntry(thisVisitImmunization, "tetanusDiphtheriaStatus"),
      },
      tpal: [maternalData.term || 0, maternalData.preterm || 0, maternalData.abortion || 0, maternalData.living || 0].join("-"),
    };
  }

  async function saveRecord() {
    const errors = {
      ...validateCurrent(),
      ...(String(chiefComplaint).trim() ? {} : { chiefComplaint: "Chief complaint is required." }),
      ...(canViewBackground
        ? stagedHistoryErrors(historyUpdateForSave(), { sections: ["family", "medical", "social"] })
        : {}),
      ...(selectedPrograms.includes("Maternal") && canViewBackground
        ? stagedHistoryErrors(historyUpdateForSave(), { sections: ["obstetric"] })
        : {}),
      ...vitalSignsErrors({ systolicBp, diastolicBp, pulse, spo2, temp, weight, height, fbs }),
      ...(selectedPrograms.includes("Maternal") && prenatalIntent === "enroll" && !String(maternalData.lmp || "").trim()
        ? { "maternalData.lmp": "Record the last menstrual period to enroll in Maternal Care." }
        : {}),
      ...rhuCarePlanErrors(diagnoses, {
        schedules: followUpSchedules,
        catchmentBhcIds: catchmentBhcs.map((bhc) => bhc.id),
        isReferralVisit: visit?.source === "referral",
        conditions: openConditions,
      }),
      ...followUpScheduleErrors({ extraSchedules: followUpSchedules }),
    };
    if (Object.keys(errors).length) {
      const first = findFirstErrorStepKey(errors, stepOrder, stepOptions);
      if (first) goToStepKey(first);
      setValidationErrors(errors);
      return;
    }
    const isWalkIn = visit?.source === "walk_in";
    const savedDiagnoses = diagnosesForRhuSave(diagnoses);
    const hasRhuFollowUp = isWalkIn && (
      savedDiagnoses.some((entry) => entry.nextAction === "rhu_follow_up")
      || followUpSchedules.some((item) => item.purposeKey === "visit" || String(item.purposeKey || "").startsWith("entry:") || String(item.purposeKey || "").startsWith("service:"))
    );
    const firstSchedule = followUpSchedules.find((item) => item.date) || followUpSchedules[0];
    setSaving(true);
    try {
      const record = await createRhuHealthRecord(
        {
          patientId: Number(patientId),
          consultationWorkflow: "rhu_itr_v1",
          category: primaryProgram ? PROGRAM_CLASSIFICATIONS[primaryProgram] : "General Consultation",
          rhuVisitId: visit.id,
          chiefComplaint,
          summaryOfPresentIllness,
          physicalExam,
          bodyFindings,
          bodyFindingReassessments,
          systolicBp,
          diastolicBp,
          temperature: temp,
          pulse,
          spo2,
          weight,
          height,
          fbs,
          treatmentNotes,
          medication: treatmentNotes,
          diagnoses: savedDiagnoses,
          prescriptionText,
          tbData: includeTb ? tbData : null,
          maternalData: selectedPrograms.includes("Maternal") ? buildRhuMaternalPayload() : null,
          expectedDeliveryDate: selectedPrograms.includes("Maternal") ? expectedDeliveryDate : undefined,
          aog: selectedPrograms.includes("Maternal") ? aog : undefined,
          prenatalIntent: selectedPrograms.includes("Maternal") ? prenatalIntent : undefined,
          familyPlanningData: selectedPrograms.includes("Family Planning")
            ? {
                ...familyPlanningData,
                previousMethod: historicalFpMethod.label || familyPlanningData.previousMethod || "",
                previous_method: historicalFpMethod.label || familyPlanningData.previousMethod || "",
              }
            : null,
          immunizationData: selectedPrograms.includes("EPI") ? { vaccineEntries: immunizationEntries } : null,
          selectedPrograms,
          primaryProgram,
          followUpSchedules: pruneServiceSchedules(followUpSchedules, selectedPrograms),
          followUpStatus: hasRhuFollowUp ? "Follow-up Required" : "",
          followUpDate: hasRhuFollowUp ? (firstSchedule?.date || "") : "",
          followUpTime: hasRhuFollowUp ? (firstSchedule?.time || "") : "",
          followUpReason: hasRhuFollowUp ? (firstSchedule?.purpose || "") : "",
          followUpTaskId: linkedFollowUpTaskId || undefined,
          visitType: linkedFollowUpTaskId ? "follow_up_visit" : "initial_consultation",
          parentHealthRecordId: linkedFollowUpTaskId ? parentHealthRecordId : undefined,
          carePlan: {
            rhu_follow_up: Boolean(hasRhuFollowUp),
            manage_to_bhc: savedDiagnoses.some((entry) => entry.nextAction === "manage_to_bhc"),
            continued_follow_up_task_ids: linkedFollowUpTaskId ? [linkedFollowUpTaskId] : [],
          },
          backgroundUpdate: canViewBackground
            ? toRecordBackgroundUpdate(omitHiddenSocialFromUpdate(backgroundUpdate, patient, new Date(), { includeBhcProfileFields: false }))
            : undefined,
          ...visitAnswerRecordFields({ informant, similarIllness, allowed: canViewBackground }),
        },
        {
          idempotencyKey: createIdempotencyKey(),
          draftId: activeDraft?.id,
          draftVersion: activeDraft?.version,
          consultationUuid,
        },
      );
      setSaveSuccess({ recordId: record.id });
      queryClient.invalidateQueries({ queryKey: ["rhu-consultation-records", patientId] });
      queryClient.invalidateQueries({ queryKey: ["body-finding-history", String(patientId)] });
      queryClient.invalidateQueries({ queryKey: ["patient-records-height"] });
      queryClient.invalidateQueries({ queryKey: ["health-records"] });
    } catch (error) {
      const fieldErrors = remapServerErrorKeys(error?.errors || {});
      setValidationErrors(fieldErrors);
      toast.error(error?.message || "Unable to save this consultation.");
    } finally {
      setSaving(false);
    }
  }

  const wizardPrograms = lockProgramsWhilePatientLoads(
    visibleConsultationPrograms(Object.keys(PROGRAM_CLASSIFICATIONS), patient).map((key) => {
      const maternalCopy = key === "Maternal"
        ? prenatalProgramCopy({
            enrolled: prenatalEnrollment.enrolled,
            included: selectedPrograms.includes("Maternal"),
          })
        : null;
      const male = Boolean(patient) && key === "Maternal" && isPatientMale(patient);
      return {
        key,
        title: key === "EPI" ? "Child Health / EPI" : key === "Maternal" ? maternalCopy.title : key,
        description: key === "Maternal" ? maternalCopy.description : "",
        enrollLabel: maternalCopy?.enrollLabel || programEnrollLabel(key),
        statusLabel: maternalCopy?.statusLabel,
        statusTone: maternalCopy?.statusTone,
        disabled: male,
        disabledReason: male ? MATERNAL_CARE_MALE_ELIGIBILITY : "",
        disabledNote: male ? "Not applicable to this patient" : "",
      };
    }),
    !patient,
  );
  const interviewHistorySections = ["family", "medical", "social"];
  const informantErrors = visitAnswerErrorMessages(
    Object.fromEntries(Object.entries(validationErrors).filter(([key]) => key.startsWith("informant"))),
  );
  const similarIllnessErrors = historyErrorMessages(
    Object.fromEntries(Object.entries(validationErrors).filter(([key]) => key.startsWith("similar_illness"))),
    { withSection: true },
  );
  const backgroundUpdateErrors = Object.fromEntries(
    Object.entries(validationErrors).filter(([key]) => key.startsWith("background_update")),
  );
  const historyPanelErrors = canViewBackground
    ? [
        ...historyErrorMessages(backgroundUpdateErrors, { withSection: true }).filter((error) => error.section !== "obstetric"),
        ...similarIllnessErrors,
      ]
    : [];
  const obstetricHistoryErrors = canViewBackground
    ? historyErrorMessages(backgroundUpdateErrors, { withSection: true }).filter((error) => error.section === "obstetric")
    : [];
  const stepHeading = resolveStepHeading({
    currentGlobalStepKey,
    activeProgramStep: programFormSteps.find((step) => step.key === activeFormStep),
    steps: consultationSteps,
    subtitles: {
      [INTERVIEW_STEP]: canViewBackground
        ? "Record the patient's reason for visit, present illness, and who gave the history."
        : "Record the patient's reason for visit and present illness.",
      [ASSESSMENT_STEP]: "Record the vital signs and examination findings for this visit.",
      [TB_INTAKE_STEP]: "Nurse TB intake fields for this visit.",
      [NEXT_STEP]: visit?.source === "referral"
        ? "Named diagnoses, treatment, and prescription. Referral follow-up stays on the Return Slip."
        : "Named diagnoses, treatment, and prescription. Staff confirm given medicines on Health Commodities.",
      [REVIEW_STEP]: "Confirm the consultation before saving the record.",
    },
  });

  const reviewSections = compactReviewSections([
    {
      key: INTERVIEW_STEP,
      title: "Patient Interview",
      stepKey: INTERVIEW_STEP,
      rows: [
        patientReviewRow({ name: formatPatientName(patient) || "Patient", id: patientId }),
        { label: "Chief Complaint", value: chiefComplaint },
        { label: "History of Present Illness", value: summaryOfPresentIllness },
        ...visitAnswerRows({ informant, similarIllness }),
      ],
    },
    {
      key: ASSESSMENT_STEP,
      title: "Physical Examination",
      stepKey: ASSESSMENT_STEP,
      rows: [
        { label: "BP", value: systolicBp || diastolicBp ? `${systolicBp || "?"}/${diastolicBp || "?"} mmHg` : "" },
        { label: "Physical Findings", value: physicalExam },
        { label: "Body Findings", value: formatBodyFindings(bodyFindings) },
        { label: "Body Finding Reassessment", value: bodyFindingReassessments.map((item) => `Record #${item.sourceRecordId}, finding ${item.sourceFindingIndex + 1}: ${BODY_FINDING_STATUS_LABELS[item.status]}`).join("; ") },
      ],
    },
    ...programFormSteps.map((step) => ({
      key: step.key,
      title: step.label,
      stepKey: step.key,
      rows: programReviewRows({
        Maternal: maternalReviewFields({ ...maternalData, expectedDeliveryDate, aog }),
        "Family Planning": familyPlanningData,
        Immunization: { vaccineEntries: immunizationEntries },
      }[step.classification]),
    })),
    includeTb ? { key: TB_INTAKE_STEP, title: "TB", stepKey: TB_INTAKE_STEP, rows: programReviewRows(tbData) } : null,
    {
      key: NEXT_STEP,
      title: "Diagnosis & Care Plan",
      stepKey: NEXT_STEP,
      rows: [
        ...diagnoses.map((entry) => ({
          label: entry.name,
          value: [
            entry.activate ? "Active condition" : "",
            diagnosisNextAction(entry) === "none" ? "No further follow-up" : "",
            diagnosisNextAction(entry) === "rhu_follow_up" ? "Schedule RHU follow-up" : "",
            diagnosisNextAction(entry) === "manage_to_bhc" ? "Manage to BHC" : "",
          ].filter(Boolean).join(" · "),
        })),
        { label: "Actions taken", value: treatmentNotes },
        { label: "Prescription", value: prescriptionText },
        ...followUpSchedules.filter((item) => item.date).map((item) => ({
          label: item.purpose || "Follow-up",
          value: [item.date, item.time].filter(Boolean).join(" · "),
        })),
      ],
    },
  ].filter(Boolean));

  if (visitError) {
    return (
      <DashboardLayout role="rhu" title="RHU Consultation">
        <div className="mx-auto max-w-lg border border-[#E5E7EB] bg-white p-6 text-sm text-[#374151]">
          <h1 className="text-lg font-bold text-[#111827]">Consultation not open</h1>
          <p className="mt-2">{visitError}</p>
          <button type="button" className="mt-4 text-sm font-semibold text-[#DC2626]" onClick={() => navigate("/rhu/patients")}>
            Back to Today's Queue
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const showSidePanel = currentStepKey === INTERVIEW_STEP || currentStepKey === ASSESSMENT_STEP;
  const stepLayout = currentStepKey === ASSESSMENT_STEP ? "assessment"
    : currentStepKey === NEXT_STEP ? "care-plan"
    : currentStepKey === REVIEW_STEP ? "review" : "interview";

  return (
    <DashboardLayout role="rhu" title="RHU Consultation">
      <div className="ehr-consult ehr-consult--rhu ehr-consult--pinned">
      <div className="ehr-consult__stage">
      <ConsultationWorkspaceBody>
        <header className={`ehr-consult__header ehr-consult__header--${stepLayout}`}>
        <ConsultationStepHeading title={stepHeading.title} subtitle={stepHeading.subtitle} />
        </header>
        <div className={`ehr-consult__grid ehr-consult__grid--${stepLayout}${showSidePanel ? " ehr-consult__grid--panel lg:grid lg:items-start lg:gap-4" : ""}`}>
        <div className="@container min-w-0 ehr-consult__form" data-consult-scroll>
        {wizardPhase === WIZARD_REVIEW ? (
          <ConsultationReviewStep
            visitDate={new Date().toLocaleDateString()}
            visitTime={new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            sections={reviewSections}
            errors={Object.values(validationErrors).filter(Boolean)}
            onEditStep={(key) => goToStepKey(key)}
          />
        ) : (
            <div className="min-w-0 space-y-4">
              {currentStepKey === INTERVIEW_STEP && (
                <fieldset disabled={assessmentLocked} className="space-y-4">
                  <Card className="ehr-consult__sheet ehr-consult__sheet--headed">
                    <div className="border-b border-[#E5E7EB] px-4 py-2.5">
                      <h2 className="text-[14px] font-bold leading-snug text-[#111827]">Chief Complaint & History of Present Illness</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">Why the patient is here today, in their own words and yours.</p>
                    </div>
                    <div className="p-4">
                      <div className="grid gap-4 @xl:grid-cols-2">
                        <label className="block text-xs">
                          <span className="mb-1.5 block font-semibold uppercase tracking-wide text-[#374151]">Chief Complaint *</span>
                          <textarea name="chiefComplaint" rows={3} aria-invalid={Boolean(validationErrors.chiefComplaint)} aria-describedby={validationErrors.chiefComplaint ? "rhu-chief-complaint-error" : undefined} value={chiefComplaint} onChange={(event) => { clearError("chiefComplaint"); setChiefComplaint(event.target.value); }} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                          {validationErrors.chiefComplaint && <span id="rhu-chief-complaint-error" role="alert" className="mt-1 block text-[11px] font-medium text-[var(--color-danger)]">{validationErrors.chiefComplaint}</span>}
                        </label>
                        <label className="block text-xs">
                          <span className="mb-1.5 block font-semibold uppercase tracking-wide text-[#374151]">History of Present Illness</span>
                          <textarea rows={3} value={summaryOfPresentIllness} onChange={(event) => setSummaryOfPresentIllness(event.target.value)} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                        </label>
                      </div>
                    </div>
                  </Card>
                  {canViewBackground && (
                    <Card className="ehr-consult__sheet ehr-consult__sheet--headed">
                      <div className="border-b border-[#E5E7EB] px-4 py-2.5">
                        <h2 className="text-[14px] font-bold leading-snug text-[#111827]" title="Informant">Informant</h2>
                        <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">Who gave this history at this visit.</p>
                      </div>
                      <div className="p-4">
                        <InterviewVisitQuestions
                          informant={informant}
                          onInformantChange={(next) => { clearErrorsStartingWith(["informant"]); setInformant(next); }}
                          errors={informantErrors}
                        />
                      </div>
                    </Card>
                  )}
                  {canViewBackground && (
                    <PatientHistoryPanel
                      key={patientId}
                      patient={patient}
                      background={patient?.medicalBackground}
                      update={backgroundUpdate}
                      onUpdateChange={(next) => {
                        clearErrorsStartingWith(["background_update"]);
                        setBackgroundUpdate(next);
                      }}
                      informant={informant}
                      onInformantChange={setInformant}
                      similarIllness={similarIllness}
                      onSimilarIllnessChange={(next) => {
                        clearErrorsStartingWith(["similar_illness"]);
                        setSimilarIllness(next);
                      }}
                      householdEnvironment={patient?.householdEnvironment}
                      today={new Date()}
                      layout="section"
                      loading={patientQuery.isLoading}
                      showGeneral={false}
                      sections={interviewHistorySections}
                      showSimilarIllness
                      showEducationAndOccupation={false}
                      inline
                      initialSection="family"
                      errors={historyPanelErrors}
                      fieldErrors={backgroundUpdateErrors}
                    />
                  )}
                </fieldset>
              )}
              {currentStepKey === ASSESSMENT_STEP && (
                <fieldset disabled={assessmentLocked} className="space-y-4">
                  <Card className="ehr-consult__sheet p-5">
                    <div>
                      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#111827]">Vital Signs</h3>
                      <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
                        <BpInputGroup
                          name="bloodPressure"
                          systolic={systolicBp}
                          diastolic={diastolicBp}
                          error={validationErrors.bloodPressure || validationErrors.systolicBp || validationErrors.diastolicBp}
                          onSystolicChange={(value) => { clearError("bloodPressure"); clearError("systolicBp"); setSystolicBp(value); }}
                          onDiastolicChange={(value) => { clearError("bloodPressure"); clearError("diastolicBp"); setDiastolicBp(value); }}
                        />
                        <ExamField label="Pulse Rate" name="pulse" error={validationErrors.pulse} value={pulse} onChange={(value) => { clearError("pulse"); setPulse(value); }} placeholder="bpm" />
                        <ExamField label="SpO₂" name="spo2" error={validationErrors.spo2} value={spo2} onChange={(value) => { clearError("spo2"); setSpo2(value); }} placeholder="%" />
                        <ExamField label="Weight" name="weight" error={validationErrors.weight} value={weight} onChange={(value) => { clearError("weight"); setWeight(value); }} placeholder="kg" />
                        <ExamField label="Height" name="height" error={validationErrors.height} value={height} onChange={(value) => { clearError("height"); setHeight(value); }} placeholder="cm" />
                        <ExamField label="Temperature" name="temp" error={validationErrors.temp} value={temp} onChange={(value) => { clearError("temp"); setTemp(value); }} placeholder="°C" />
                        {shouldShowBmiDisplay(patient, visit?.consultationDate || visit?.date || new Date()) && (
                          <BmiOutputField weight={weight} height={height} />
                        )}
                      </div>
                      {areVitalSignsBlank({ systolicBp, diastolicBp, pulse, spo2, temp, weight, height, fbs }) && (
                        <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">{EMPTY_VITALS_REMINDER}</p>
                      )}
                      <div className="mt-4">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#374151]">Additional Measurements</p>
                        <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
                          <ExamField
                            label="Fasting Blood Sugar (FBS) (mg/dL)"
                            name="fbs"
                            error={validationErrors["vital_signs.fbs"] || validationErrors.fbs}
                            value={fbs}
                            onChange={(value) => { clearError("fbs"); clearError("vital_signs.fbs"); setFbs(value); }}
                            placeholder="mg/dL"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[#111827]">Examination Findings</h3>
                      <p className="mb-3 text-xs leading-relaxed text-[#6B7280]">
                        Visit-level, non-localized findings (appearance, hydration, respiratory effort, etc.). Record location-specific findings on the body map.
                      </p>
                      <label className="block text-xs">
                        <span className="mb-1.5 block font-semibold uppercase tracking-wide text-[#374151]">General Examination Findings</span>
                        <textarea
                          rows={4}
                          value={physicalExam}
                          onChange={(event) => setPhysicalExam(event.target.value)}
                          placeholder="Appearance, hydration, respiratory effort, and other non-localized findings for this visit..."
                          className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <div className="mt-6 border-t border-[#E5E7EB] pt-4">
                      <BodyFindingsList
                        findings={bodyFindings}
                        readOnly={assessmentLocked || saving || Boolean(saveSuccess)}
                        onEdit={(item) => {
                          setBodyPreviewSide(item.side);
                          setBodyDialog({ region: item.region, side: item.side, anchor: null, editingId: item.id });
                        }}
                        onRemove={(id) => setBodyFindings((current) => current.filter((item) => item.id !== id))}
                      />
                    </div>
                    <PreviousBodyFindings
                      title="Previous Findings Reassessment"
                      findings={previousBodyFindings}
                      decisions={bodyFindingReassessments}
                      onChange={changeBodyReassessments}
                      loading={recordsQuery.isFetching}
                      loadError={recordsQuery.isError}
                      onRefresh={() => recordsQuery.refetch()}
                      errors={validationErrors}
                      readOnly={assessmentLocked || !canViewBackground || saving || Boolean(saveSuccess)}
                    />
                  </Card>
                </fieldset>
              )}
              {programFormSteps.some((step) => step.key === currentStepKey) && currentStepKey === programStepKey("Immunization") && (
                <fieldset disabled={assessmentLocked}>
                  <ImmunizationVisitFields
                    vaccineOptions={CHILD_VACCINE_OPTIONS}
                    birthDate={patient?.birthdate || patient?.birthDate || patient?.dateOfBirth}
                    visitDate={visit?.consultationDate || visit?.date || visit?.created_at || new Date()}
                    entries={immunizationEntries}
                    temperature={temp}
                    pulse={pulse}
                    spo2={spo2}
                    weight={weight}
                    height={height}
                    errors={validationErrors}
                    onTemperatureChange={setTemp}
                    onPulseChange={setPulse}
                    onSpo2Change={setSpo2}
                    onWeightChange={setWeight}
                    onHeightChange={setHeight}
                    onToggleVaccine={(name, checked) => {
                      setImmunizationEntries((current) =>
                        checked
                          ? [...current, { vaccineName: name }]
                          : current.filter((entry) => entry.vaccineName !== name),
                      );
                    }}
                    hideBasicMonitoring
                    medicinesSlot={null}
                  />
                </fieldset>
              )}
              {programFormSteps.some((step) => step.key === currentStepKey) && currentStepKey === programStepKey("Maternal") && (
                <fieldset disabled={assessmentLocked}>
                  <PrenatalAssessmentForm
                    maternalData={maternalData}
                    expectedDeliveryDate={expectedDeliveryDate}
                    aog={aog}
                    onMaternalChange={handleMaternalChange}
                    onNestedChange={handleNestedMaternalChange}
                    onRiskChange={handleRiskAssessmentChange}
                    onExpectedDeliveryDateChange={setExpectedDeliveryDate}
                    onAogChange={setAog}
                    locked={assessmentLocked}
                    errors={validationErrors}
                    patient={patient}
                    background={patient?.medicalBackground}
                    backgroundUpdate={backgroundUpdate}
                    onBackgroundUpdateChange={(next) => {
                      clearErrorsStartingWith(["background_update"]);
                      setBackgroundUpdate(next);
                    }}
                    historyErrors={obstetricHistoryErrors}
                    fieldErrors={backgroundUpdateErrors}
                    includeObstetricHistory={canViewBackground}
                    prenatalHistory={prenatalHistory}
                  />
                </fieldset>
              )}
              {programFormSteps.some((step) => step.key === currentStepKey) && currentStepKey === programStepKey("Family Planning") && (
                <fieldset disabled={assessmentLocked} className="ehr-consult__sheet p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Client type</span>
                      <input value={familyPlanningData.clientType} onChange={(event) => setFamilyPlanningData((current) => ({ ...current, clientType: event.target.value }))} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                    </label>
                    <div className="block text-xs">
                      <p className="mb-1 font-semibold uppercase tracking-wide text-[#374151]">Previous method</p>
                      <p className="text-sm text-[#111827]">{historicalFpMethod.label || "Not recorded"}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                        From Patient History. This visit records Method used.
                      </p>
                    </div>
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Method used</span>
                      <input value={familyPlanningData.methodUsed} onChange={(event) => setFamilyPlanningData((current) => ({ ...current, methodUsed: event.target.value }))} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                    </label>
                  </div>
                </fieldset>
              )}
              {currentStepKey === TB_INTAKE_STEP && (
                <fieldset disabled={assessmentLocked}>
                  {existingTbCase?.tbCaseNumber ? (
                    <p className="mb-3 text-sm text-[#545F73]">
                      Referencing registered TB case <span className="font-semibold text-[#0B1C30]">{existingTbCase.tbCaseNumber}</span>. A new case number is not requested.
                    </p>
                  ) : null}
                  <TbTreatmentCardForm
                    value={tbData}
                    onChange={(next) => { clearErrorsStartingWith(["tbData", "tb_data"]); setTbData(next); }}
                    errors={validationErrors}
                    mode="encode"
                    readOnly={assessmentLocked}
                    referenceCaseNumber={existingTbCase?.tbCaseNumber || ""}
                  />
                </fieldset>
              )}
              {currentStepKey === NEXT_STEP && (
                <fieldset disabled={clinicalLocked} className="min-w-0">
                  <RhuDiagnosisCarePlanSection
                    diagnoses={diagnoses}
                    diagnosisDraft={diagnosisDraft}
                    onDiagnosisDraftChange={setDiagnosisDraft}
                    onAddDiagnosis={(entry) => {
                      setDiagnoses((current) => [...current, entry]);
                      setDiagnosisDraft("");
                    }}
                    onChangeDiagnosis={handleDiagnosisChange}
                    onRemoveDiagnosis={handleRemoveDiagnosis}
                    monitoredNames={monitoredNames}
                    schedules={followUpSchedules}
                    onFollowUpChange={handleDiagnosisFollowUp}
                    conditions={openConditions}
                    catchmentBhcs={catchmentBhcs}
                    isReferralVisit={visit?.source === "referral"}
                    selectedPrograms={selectedPrograms}
                    onServiceNextAction={handleServiceNextAction}
                    onServiceFollowUp={handleServiceFollowUp}
                    treatmentNotes={treatmentNotes}
                    onTreatmentNotesChange={setTreatmentNotes}
                    prescriptionText={prescriptionText}
                    onPrescriptionTextChange={setPrescriptionText}
                    registry={registry}
                    existingTbCase={existingTbCase}
                    conditionReferences={conditionReferences}
                    errors={validationErrors}
                    disabled={clinicalLocked}
                  />
                </fieldset>
              )}
            </div>
        )}
        </div>
              {currentStepKey === INTERVIEW_STEP && (
                <fieldset disabled={assessmentLocked} className="contents">
                <ConsultationProgramPanel
                  heading="Health Services"
                  description="Prenatal enrollment is optional. Clicking Enroll adds prenatal fields to this consultation. Prenatal becomes Active only after a clinician finalizes the visit."
                  programs={wizardPrograms}
                  selected={selectedPrograms}
                  primary={primaryProgram}
                  onSelect={handleProgramSelect}
                  onPrimaryChange={setPrimaryProgram}
                />
                </fieldset>
              )}
              {currentStepKey === ASSESSMENT_STEP && (
                <BodyPreviewPanel
                  findings={bodyFindings}
                  previousFindings={previousBodyFindings}
                  reassessments={bodyFindingReassessments}
                  onReassess={changeBodyReassessments}
                  reassessmentDisabled={!canViewBackground || recordsQuery.isFetching || recordsQuery.isError}
                  readOnly={assessmentLocked || saving || Boolean(saveSuccess)}
                  sex={patient?.sex}
                  birthDate={patient?.birthdate || patient?.birthDate || patient?.dateOfBirth}
                  side={bodyPreviewSide}
                  onSideChange={setBodyPreviewSide}
                  onChange={setBodyFindings}
                  dialog={bodyDialog}
                  onDialogChange={setBodyDialog}
                />
              )}
        </div>
      </ConsultationWorkspaceBody>
      </div>
        <ConsultationActionBar
          onPrevious={handlePrevious}
          previousLabel={currentStepKey === INTERVIEW_STEP ? "Back to Queue" : "Previous"}
          secondaryAction={
            autosave.status === "saving" ? (
              <span className="text-xs text-neutral-500">Saving draft…</span>
            ) : autosave.lastSavedAt ? (
              <span className="text-xs text-neutral-500">Draft saved</span>
            ) : null
          }
          onContinue={handleContinue}
          continueLabel={wizardPhase === WIZARD_REVIEW ? "Finalize Consultation" : "Next"}
          continueBusy={saving}
          continueBusyLabel="Saving..."
          continueDisabled={wizardPhase === WIZARD_REVIEW && !canFinalize}
        />
      <SuccessModal
        open={Boolean(saveSuccess)}
        title="Health Record Saved"
        description="The visit is closed as completed. The record is on this patient's profile."
        onClose={() => navigate("/rhu/patients")}
        actions={[
          {
            label: "View Health Record",
            variant: "primary",
            onClick: () => navigate(`/rhu/health-records/${saveSuccess.recordId}`),
          },
          { label: "Back to Queue", onClick: () => navigate("/rhu/patients") },
        ]}
      />
      </div>
    </DashboardLayout>
  );
}

function ExamField({ label, name, error, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">{label}</label>
      <input
        name={name}
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 w-full rounded-none border px-3 text-sm outline-none ${
          error ? "border-[#DC2626] ring-2 ring-red-200" : "border-[#D1D5DB]"
        }`}
      />
      {error ? <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p> : null}
    </div>
  );
}

function BpInputGroup({
  systolic,
  diastolic,
  onSystolicChange,
  onDiastolicChange,
  error = "",
  name,
}) {
  const inputClass = error
    ? "border-[#DC2626] bg-white ring-2 ring-red-200"
    : "border-[#D1D5DB] bg-white";
  return (
    <div data-field={name}>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        Blood Pressure (mmHg)
      </label>
      <div className="flex items-center gap-0">
        <input
          name="systolicBp"
          type="number"
          placeholder="Systolic"
          value={systolic}
          aria-invalid={Boolean(error) || undefined}
          onChange={(event) => onSystolicChange(event.target.value)}
          className={`h-9 w-full rounded-none border px-3 text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClass}`}
        />
        <div className="flex h-9 w-10 shrink-0 items-center justify-center border-y border-[#E5E7EB] bg-[#F9FAFB] text-sm font-bold text-[#6B7280]">
          /
        </div>
        <input
          name="diastolicBp"
          type="number"
          placeholder="Diastolic"
          value={diastolic}
          aria-invalid={Boolean(error) || undefined}
          onChange={(event) => onDiastolicChange(event.target.value)}
          className={`h-9 w-full rounded-none border px-3 text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClass}`}
        />
      </div>
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-[#DC2626]">{error}</p>
      ) : (
        <p className="mt-1 text-[9px] text-[#BFBFBF]">Systolic / Diastolic</p>
      )}
    </div>
  );
}

function BmiOutputField({ weight, height }) {
  const bmi = calculateBmi(weight, height);
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">BMI</label>
      <div className="flex h-9 w-full items-center rounded-none border border-[#E5E7EB] bg-[#F9FAFB] px-3">
        <span className="text-sm font-bold text-gray-900">{bmi === null ? "—" : formatBmi(bmi)}</span>
      </div>
    </div>
  );
}
