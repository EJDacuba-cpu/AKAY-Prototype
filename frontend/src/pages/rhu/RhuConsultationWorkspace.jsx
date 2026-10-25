import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import DashboardLayout from "../../components/layout/DashboardLayout";
import "../../components/features/health-records/wizard/consultation-ehr.css";
import { SuccessModal } from "../../components/common";
import { DatePickerField } from "../../components/common/forms/DatePickerField";
import PatientHistoryPanel from "../../components/features/patients/history/PatientHistoryPanel";
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
import PrescribedMedicinesSection from "../../components/features/health-records/PrescribedMedicinesSection";
import TbTreatmentCardForm, {
  EMPTY_TB_DATA,
  normalizeTbData,
} from "../../components/features/health-records/TbTreatmentCardForm";
import { formatBodyFindings, normalizeBodyFindings } from "../../utils/bodyFindings";
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
  computeAogFromLmp,
  computeEddFromLmp,
  mergeMaternalData,
  sanitizeRiskAssessment,
  thisVisitDoseEntry,
} from "../../utils/prenatalForm";
import { getPrenatalEnrollment, prenatalProgramCopy } from "../../utils/prenatalEnrollment";
import { applyRiskFlags, getMaternalRiskFlags } from "../../utils/maternalRisk";
import { isPatientMale } from "../../utils/programApplicability";
import { getLatestRecordedHeight } from "../../utils/currentPatientVitals";
import {
  ASSESSMENT_STEP,
  EXIT_STEP,
  HISTORY_STEP,
  INTERVIEW_STEP,
  NEXT_STEP,
  OUTCOME_STEP,
  PRESCRIPTION_STEP,
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
  pickErrorsForStep,
  programStepKey,
  remapServerErrorKeys,
  resolveFormStep,
  resolveRestoredPosition,
  resolveStepHeading,
} from "../../utils/consultationSteps";
import { createDiagnosisId } from "../../utils/diagnoses";
import { defaultInformant } from "../../utils/patientHistory";
import {
  restoreBackgroundUpdate,
  toDraftBackgroundUpdate,
  toRecordBackgroundUpdate,
} from "../../utils/backgroundUpdate";
import { canUpdateBackground } from "../../utils/backgroundEditing";
import {
  visitAnswerDraftFields,
  visitAnswerRecordFields,
  visitAnswerRows,
} from "../../utils/historyStep";
import { getCurrentUser } from "../../utils/auth";
import { formatPatientName } from "../../utils/formatters";
import { createIdempotencyKey } from "../../utils/idempotency";
import { RHU_DRAFTS_ENABLED } from "../../utils/featureFlags";
import useDraftAutosave from "../../hooks/useDraftAutosave";
import useClinicalRegistry from "../../hooks/useClinicalRegistry";
import { getConsultationPatientQuery } from "../../services/consultationPatientQuery";
import { listHealthRecordDrafts, getHealthRecordDraft } from "../../services/healthRecordDraftService";
import { createRhuHealthRecord, getHealthRecordsByPatient } from "../../services/healthRecordService";
import { getFollowUpTasks } from "../../services/followUpTaskService";
import { getRhuMedicines, loadMedicineAvailability } from "../../services/medicineService";
import { listRhuVisits } from "../../services/rhuVisitService";
import useAccess from "../../hooks/useAccess";

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
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const access = useAccess();
  const currentUser = getCurrentUser();
  const canEncode = access.can("consultations.encode");
  const canFinalize = access.can("consultations.finalize");
  const canViewBackground = access.can("clinical.history");
  const canPrescribe = access.can("inventory.view");
  const visitId = Number(params.get("visitId") || 0) || null;
  const patientId = String(params.get("patientId") || "");
  const followUpTaskId = Number(params.get("followUpTaskId") || 0) || null;
  const canUpdateHistory = canUpdateBackground(currentUser);

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
  const [selectedPrograms, setSelectedPrograms] = useState([]);
  const [primaryProgram, setPrimaryProgram] = useState("");
  const [includeTb, setIncludeTb] = useState(false);
  const [tbData, setTbData] = useState(EMPTY_TB_DATA);
  const [maternalData, setMaternalData] = useState(EMPTY_MATERNAL_DATA);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [aog, setAog] = useState("");
  const [familyPlanningData, setFamilyPlanningData] = useState({ clientType: "", methodUsed: "", actionTaken: "" });
  const [immunizationEntries, setImmunizationEntries] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [prescribedMedicines, setPrescribedMedicines] = useState([]);
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [rhuFollowUp, setRhuFollowUp] = useState(false);
  const [manageToBhc, setManageToBhc] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [linkedFollowUpTaskId, setLinkedFollowUpTaskId] = useState(followUpTaskId);
  const [parentHealthRecordId, setParentHealthRecordId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState("");
  const [bodyDialog, setBodyDialog] = useState(null);
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
  const prenatalEnrollment = useMemo(
    () => getPrenatalEnrollment(patient || {}, patientRecords),
    [patient, patientRecords],
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
    if (!canPrescribe) return;
    loadMedicineAvailability()
      .then(() => {
        setCatalog(getRhuMedicines());
        setCatalogError("");
      })
      .catch((error) => setCatalogError(error?.message || "Unable to load medicines."));
  }, [canPrescribe]);

  useEffect(() => {
    if (informant || !patient) return;
    setInformant(defaultInformant(patient, new Date()));
  }, [patient, informant]);

  useEffect(() => {
    if (!maternalData.lmp) {
      setExpectedDeliveryDate("");
      setAog("");
      return;
    }
    setExpectedDeliveryDate(computeEddFromLmp(maternalData.lmp));
    setAog(computeAogFromLmp(maternalData.lmp, new Date()));
  }, [maternalData.lmp]);

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
    if (!followUpTaskId && !patientId) return;
    getFollowUpTasks({ patient_id: patientId, active: true })
      .then((tasks) => {
        const match = (followUpTaskId
          ? tasks.find((task) => Number(task.id) === Number(followUpTaskId))
          : null) || tasks[0];
        if (match) {
          setLinkedFollowUpTaskId(Number(match.id));
          setParentHealthRecordId(Number(match.healthRecordId || match.originalHealthRecordId) || null);
        }
      })
      .catch(() => {});
  }, [followUpTaskId, patientId, linkedFollowUpTaskId]);

  const consultationUuid = visit?.consultation_uuid || visit?.consultationUuid || "";
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
      backgroundUpdate: canViewBackground ? toDraftBackgroundUpdate(backgroundUpdate) : undefined,
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
      selectedPrograms,
      primaryProgram,
      includeTb,
      tbData: includeTb ? tbData : null,
      maternalData,
      expectedDeliveryDate,
      aog,
      prenatalIntent,
      familyPlanningData,
      immunizationData: { vaccineEntries: immunizationEntries },
      diagnoses,
      prescribedMedicines,
      medication: treatmentNotes,
      rhuFollowUp,
      manageToBhc,
      consultationWorkflow: "rhu_itr_v1",
      followUpDate,
      followUpTime,
      followUpReason,
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
      prescribedMedicines,
      treatmentNotes,
      rhuFollowUp,
      manageToBhc,
      followUpDate,
      followUpTime,
      followUpReason,
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
    const programs = getConsultationPrograms(payload);
    setSelectedPrograms(programs);
    setPrimaryProgram(payload.primaryProgram || programs[0] || "");
    setIncludeTb(Boolean(payload.includeTb || payload.tbData));
    if (payload.tbData) setTbData(normalizeTbData(payload.tbData));
    if (payload.maternalData) setMaternalData((current) => mergeMaternalData(payload.maternalData, current));
    if (payload.expectedDeliveryDate) setExpectedDeliveryDate(payload.expectedDeliveryDate);
    if (payload.aog) setAog(payload.aog);
    if (payload.familyPlanningData) setFamilyPlanningData((current) => ({ ...current, ...payload.familyPlanningData }));
    if (payload.immunizationData?.vaccineEntries) setImmunizationEntries(payload.immunizationData.vaccineEntries);
    setDiagnoses(Array.isArray(payload.diagnoses) ? payload.diagnoses : []);
    setPrescribedMedicines(Array.isArray(payload.prescribedMedicines) ? payload.prescribedMedicines : []);
    setTreatmentNotes(payload.medication || "");
    setRhuFollowUp(Boolean(payload.rhuFollowUp));
    setManageToBhc(Boolean(payload.manageToBhc));
    setFollowUpDate(payload.followUpDate || "");
    setFollowUpTime(payload.followUpTime || "");
    setFollowUpReason(payload.followUpReason || "");
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

  function validateCurrent() {
    const errors = {};
    if (currentStepKey === INTERVIEW_STEP && !String(chiefComplaint).trim()) {
      errors.chiefComplaint = "Chief complaint is required.";
    }
    if (currentStepKey === programStepKey("Maternal") && selectedPrograms.includes("Maternal")) {
      if (prenatalIntent === "enroll" && !String(maternalData.lmp || "").trim()) {
        errors["maternalData.lmp"] = "Record the last menstrual period to enroll in prenatal care.";
      }
    }
    if (includeTb && currentStepKey === NEXT_STEP && canFinalize) {
      if (!String(tbData.diagnosis?.tbCaseNumber || "").trim()) {
        errors["tbData.diagnosis.tbCaseNumber"] = "TB case number is required.";
      }
    }
    if (currentStepKey === OUTCOME_STEP && rhuFollowUp && visit?.source !== "referral" && !followUpDate) {
      errors.followUpDate = "Set the RHU follow-up date.";
    }
    setValidationErrors(errors);
    return errors;
  }

  function goToStepKey(key) {
    if (key === REVIEW_STEP) {
      setWizardPhase(WIZARD_REVIEW);
      return;
    }
    if (key === NEXT_STEP || key === PRESCRIPTION_STEP || key === OUTCOME_STEP) {
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(key);
      return;
    }
    setWizardPhase(WIZARD_FORM);
    setFormStep(key);
  }

  function handlePrevious() {
    if (wizardPhase === WIZARD_REVIEW) {
      setWizardPhase(WIZARD_NEXT);
      setNextScreen(OUTCOME_STEP);
      return;
    }
    if (wizardPhase === WIZARD_NEXT) {
      if (nextScreen === OUTCOME_STEP) {
        setNextScreen(PRESCRIPTION_STEP);
        return;
      }
      if (nextScreen === PRESCRIPTION_STEP) {
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
      if (nextScreen === NEXT_STEP) {
        setNextScreen(PRESCRIPTION_STEP);
        return;
      }
      if (nextScreen === PRESCRIPTION_STEP) {
        setNextScreen(OUTCOME_STEP);
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
      expectedDeliveryDate,
      aog,
      previous_fp_method_used: maternalData.previousFpMethodUsed || "",
      previous_fp_method_other: maternalData.previousFpMethodOther || "",
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
      ...(selectedPrograms.includes("Maternal") && prenatalIntent === "enroll" && !String(maternalData.lmp || "").trim()
        ? { "maternalData.lmp": "Record the last menstrual period to enroll in prenatal care." }
        : {}),
    };
    if (Object.keys(errors).length) {
      const first = findFirstErrorStepKey(errors, stepOrder, stepOptions);
      if (first) goToStepKey(first);
      setValidationErrors(errors);
      return;
    }
    const isWalkIn = visit?.source === "walk_in";
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
          diagnoses: diagnoses.map((entry) => ({
            id: entry.id,
            name: entry.name,
            activate: Boolean(entry.activate),
            manageToBhc: Boolean(entry.manageToBhc) || manageToBhc,
          })),
          prescribedMedicines,
          tbData: includeTb ? tbData : null,
          maternalData: selectedPrograms.includes("Maternal") ? buildRhuMaternalPayload() : null,
          expectedDeliveryDate: selectedPrograms.includes("Maternal") ? expectedDeliveryDate : undefined,
          aog: selectedPrograms.includes("Maternal") ? aog : undefined,
          prenatalIntent: selectedPrograms.includes("Maternal") ? prenatalIntent : undefined,
          familyPlanningData: selectedPrograms.includes("Family Planning") ? familyPlanningData : null,
          immunizationData: selectedPrograms.includes("EPI") ? { vaccineEntries: immunizationEntries } : null,
          selectedPrograms,
          primaryProgram,
          followUpStatus: isWalkIn && rhuFollowUp ? "Follow-up Required" : "",
          followUpDate: isWalkIn && rhuFollowUp ? followUpDate : "",
          followUpTime: isWalkIn && rhuFollowUp ? followUpTime : "",
          followUpReason: isWalkIn && rhuFollowUp ? followUpReason : "",
          followUpTaskId: linkedFollowUpTaskId || undefined,
          visitType: linkedFollowUpTaskId ? "follow_up_visit" : "initial_consultation",
          parentHealthRecordId: linkedFollowUpTaskId ? parentHealthRecordId : undefined,
          carePlan: {
            rhu_follow_up: Boolean(isWalkIn && rhuFollowUp),
            manage_to_bhc: Boolean(manageToBhc),
            continued_follow_up_task_ids: linkedFollowUpTaskId ? [linkedFollowUpTaskId] : [],
          },
          backgroundUpdate: canViewBackground ? toRecordBackgroundUpdate(backgroundUpdate) : undefined,
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
    } catch (error) {
      const fieldErrors = remapServerErrorKeys(error?.errors || {});
      setValidationErrors(fieldErrors);
      toast.error(error?.message || "Unable to save this consultation.");
    } finally {
      setSaving(false);
    }
  }

  const wizardPrograms = lockProgramsWhilePatientLoads(
    Object.entries(PROGRAM_CLASSIFICATIONS).map(([key]) => {
      const maternalCopy = key === "Maternal"
        ? prenatalProgramCopy({
            enrolled: prenatalEnrollment.enrolled,
            included: selectedPrograms.includes("Maternal"),
          })
        : null;
      const male = Boolean(patient) && key === "Maternal" && isPatientMale(patient);
      return {
        key,
        title: key === "EPI" ? "Child Health / EPI" : key === "Maternal" ? "Prenatal Care" : key,
        description: key === "Maternal"
          ? prenatalEnrollment.enrolled
            ? "Active prenatal care from a finalized consultation. Continue this visit without starting a second enrollment."
            : "Optional. Enrollment becomes Active only after this consultation is finalized."
          : "",
        enrollLabel: maternalCopy?.enrollLabel || programEnrollLabel(key),
        statusLabel: maternalCopy?.statusLabel,
        statusTone: maternalCopy?.statusTone,
        disabled: male,
        disabledReason: male ? "Prenatal Care records are for pregnant clients. This patient is recorded as male." : "",
        disabledNote: male ? "Not applicable to this patient" : "",
      };
    }),
    !patient,
  );
  const stepHeading = resolveStepHeading({
    currentGlobalStepKey,
    activeProgramStep: programFormSteps.find((step) => step.key === activeFormStep),
    steps: consultationSteps,
    subtitles: {
      [INTERVIEW_STEP]: "Chief complaint and present illness for this RHU encounter.",
      [HISTORY_STEP]: "ITR History I–V. Review or update each section.",
      [ASSESSMENT_STEP]: "Vital signs, findings, and the body map.",
      [TB_INTAKE_STEP]: "Nurse TB intake fields for this visit.",
      [NEXT_STEP]: "Named diagnoses, activation, and optional Manage to BHC.",
      [PRESCRIPTION_STEP]: "RHU catalog search, quantity, and instruction. Stock is not deducted.",
      [OUTCOME_STEP]: visit?.source === "referral"
        ? "Referral stays on the Return Slip. This save only closes the visit."
        : "Schedule an RHU follow-up and/or recommend BHC monitoring.",
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
      ],
    },
    ...programFormSteps.map((step) => ({
      key: step.key,
      title: step.label,
      stepKey: step.key,
      rows: programReviewRows({
        Maternal: { ...maternalData, expectedDeliveryDate, aog },
        "Family Planning": familyPlanningData,
        Immunization: { vaccineEntries: immunizationEntries },
      }[step.classification]),
    })),
    includeTb ? { key: TB_INTAKE_STEP, title: "TB", stepKey: TB_INTAKE_STEP, rows: programReviewRows(tbData) } : null,
    {
      key: NEXT_STEP,
      title: "Diagnosis",
      stepKey: NEXT_STEP,
      rows: diagnoses.map((entry) => ({
        label: entry.name,
        value: [entry.activate ? "Activate" : "", entry.manageToBhc || manageToBhc ? "Manage to BHC" : ""].filter(Boolean).join(" · "),
      })),
    },
    {
      key: PRESCRIPTION_STEP,
      title: "Prescription",
      stepKey: PRESCRIPTION_STEP,
      rows: prescribedMedicines.map((line) => ({
        label: line.medicineName || line.name,
        value: `${line.quantity}${line.unit ? ` ${line.unit}` : ""}${line.instructions ? ` · ${line.instructions}` : ""}`,
      })),
    },
    {
      key: OUTCOME_STEP,
      title: "Care and Outcome",
      stepKey: OUTCOME_STEP,
      rows: [
        { label: "Actions taken", value: treatmentNotes },
        { label: "RHU follow-up", value: rhuFollowUp ? followUpDate : "" },
        { label: "Manage to BHC", value: manageToBhc ? "Yes" : "" },
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

  const stepErrors = Object.values(pickErrorsForStep(validationErrors, currentStepKey, stepOptions)).filter(Boolean);

  return (
    <DashboardLayout role="rhu" title="RHU Consultation">
      <ConsultationWorkspaceBody>
        <ConsultationStepHeading title={stepHeading.title} subtitle={stepHeading.subtitle} />
        {stepErrors.length > 0 && (
          <div role="alert" className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#B91C1C]">
            {stepErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        {wizardPhase === WIZARD_REVIEW ? (
          <ConsultationReviewStep
            visitDate={new Date().toLocaleDateString()}
            visitTime={new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            sections={reviewSections}
            errors={Object.values(validationErrors).filter(Boolean)}
            onEditStep={(key) => goToStepKey(key)}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="min-w-0 space-y-4">
              {currentStepKey === INTERVIEW_STEP && (
                <fieldset disabled={assessmentLocked} className="space-y-4">
                  <section className="border border-[#E5E7EB] bg-white p-4">
                    <h3 className="text-sm font-bold">Chief Complaint & History of Present Illness</h3>
                    <div className="mt-3 grid gap-3 @xl:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Chief Complaint *</span>
                        <textarea rows={3} value={chiefComplaint} onChange={(event) => { clearError("chiefComplaint"); setChiefComplaint(event.target.value); }} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                      </label>
                      <label className="block text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">History of Present Illness</span>
                        <textarea rows={3} value={summaryOfPresentIllness} onChange={(event) => setSummaryOfPresentIllness(event.target.value)} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                      </label>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={includeTb} onChange={(event) => setIncludeTb(event.target.checked)} />
                      TB pathway (intake fields on a later step)
                    </label>
                  </section>
                </fieldset>
              )}
              {currentStepKey === HISTORY_STEP && (
                <fieldset disabled={assessmentLocked}>
                  <PatientHistoryPanel
                    patient={patient}
                    background={patient?.medicalBackground}
                    update={backgroundUpdate}
                    onUpdateChange={setBackgroundUpdate}
                    informant={informant}
                    onInformantChange={setInformant}
                    similarIllness={similarIllness}
                    onSimilarIllnessChange={setSimilarIllness}
                    householdEnvironment={patient?.householdEnvironment}
                    layout="section"
                    locked={!canViewBackground || !canUpdateHistory}
                    loading={patientQuery.isLoading}
                    editLink={patientId ? `/rhu/patients/${patientId}` : undefined}
                  />
                </fieldset>
              )}
              {currentStepKey === ASSESSMENT_STEP && (
                <fieldset disabled={assessmentLocked} className="space-y-4">
                  <section className="border border-[#E5E7EB] bg-white p-4">
                    <h3 className="text-sm font-bold">Vital Signs</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        ["Systolic BP", systolicBp, setSystolicBp],
                        ["Diastolic BP", diastolicBp, setDiastolicBp],
                        ["Temperature", temp, setTemp],
                        ["Pulse", pulse, setPulse],
                        ["SpO2", spo2, setSpo2],
                        ["Weight (kg)", weight, setWeight],
                        ["Height (cm)", height, setHeight],
                        ["FBS", fbs, setFbs],
                      ].map(([label, value, setter]) => (
                        <label key={label} className="block text-xs">
                          <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">{label}</span>
                          <input value={value} onChange={(event) => setter(event.target.value)} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Physical Findings</span>
                      <textarea rows={4} value={physicalExam} onChange={(event) => setPhysicalExam(event.target.value)} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                    </label>
                    <div className="mt-3">
                      <BodyFindingsList findings={bodyFindings} />
                    </div>
                  </section>
                </fieldset>
              )}
              {programFormSteps.some((step) => step.key === currentStepKey) && currentStepKey === programStepKey("Immunization") && (
                <fieldset disabled={assessmentLocked}>
                  <ImmunizationVisitFields
                    vaccineOptions={CHILD_VACCINE_OPTIONS}
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
                    history={{
                      background: canViewBackground ? patient?.medicalBackground : null,
                      update: canViewBackground ? backgroundUpdate : null,
                      locked: !canViewBackground,
                      canReview: Boolean(patient) && !isPatientMale(patient),
                      editLink: patientId ? `/rhu/patients/${patientId}` : undefined,
                      onReview: () => goToStepKey(HISTORY_STEP),
                    }}
                  />
                </fieldset>
              )}
              {programFormSteps.some((step) => step.key === currentStepKey) && currentStepKey === programStepKey("Family Planning") && (
                <fieldset disabled={assessmentLocked} className="border border-[#E5E7EB] bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Client type</span>
                      <input value={familyPlanningData.clientType} onChange={(event) => setFamilyPlanningData((current) => ({ ...current, clientType: event.target.value }))} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                    </label>
                    <label className="block text-xs">
                      <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Method used</span>
                      <input value={familyPlanningData.methodUsed} onChange={(event) => setFamilyPlanningData((current) => ({ ...current, methodUsed: event.target.value }))} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                    </label>
                  </div>
                </fieldset>
              )}
              {currentStepKey === TB_INTAKE_STEP && (
                <fieldset disabled={assessmentLocked}>
                  <TbTreatmentCardForm value={tbData} onChange={setTbData} mode="encode" readOnly={assessmentLocked} />
                </fieldset>
              )}
              {currentStepKey === NEXT_STEP && (
                <fieldset disabled={clinicalLocked} className="space-y-4">
                  <section className="border border-[#E5E7EB] bg-white p-4">
                    <h3 className="text-sm font-bold">Named diagnoses</h3>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={diagnosisDraft}
                        list="rhu-itr-conditions"
                        onChange={(event) => setDiagnosisDraft(event.target.value)}
                        placeholder="Hypertension, TB, diabetes…"
                        className="h-9 flex-1 rounded-none border border-[#D1D5DB] px-3 text-sm"
                      />
                      <datalist id="rhu-itr-conditions">
                        {monitoredNames.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        onClick={() => {
                          const name = diagnosisDraft.trim();
                          if (!name) return;
                          setDiagnoses((current) => [...current, { id: createDiagnosisId(), name, activate: true, manageToBhc: false }]);
                          setDiagnosisDraft("");
                        }}
                        className="rounded-none border border-[#D1D5DB] px-3 text-xs font-semibold"
                      >
                        Add
                      </button>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {diagnoses.map((entry, index) => (
                        <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border border-[#E5E7EB] px-3 py-2 text-sm">
                          <span className="font-semibold">{entry.name}</span>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={Boolean(entry.activate)} onChange={(event) => setDiagnoses((current) => current.map((row, i) => (i === index ? { ...row, activate: event.target.checked } : row)))} />
                            Activate
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={Boolean(entry.manageToBhc)} onChange={(event) => setDiagnoses((current) => current.map((row, i) => (i === index ? { ...row, manageToBhc: event.target.checked } : row)))} />
                            Manage to BHC
                          </label>
                          <button type="button" className="text-xs text-[#B91C1C]" onClick={() => setDiagnoses((current) => current.filter((row) => row.id !== entry.id))}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                  {includeTb && <TbTreatmentCardForm value={tbData} onChange={setTbData} mode="finalize" readOnly={clinicalLocked} />}
                </fieldset>
              )}
              {currentStepKey === PRESCRIPTION_STEP && (
                <fieldset disabled={clinicalLocked} className="border border-[#E5E7EB] bg-white p-4">
                  <PrescribedMedicinesSection
                    catalog={catalog}
                    value={prescribedMedicines}
                    onChange={setPrescribedMedicines}
                    disabled={clinicalLocked || !canPrescribe}
                    error={catalogError}
                    onRetry={() => loadMedicineAvailability().then(() => setCatalog(getRhuMedicines()))}
                  />
                </fieldset>
              )}
              {currentStepKey === OUTCOME_STEP && (
                <fieldset disabled={clinicalLocked} className="space-y-4 border border-[#E5E7EB] bg-white p-4">
                  <label className="block text-xs">
                    <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Actions taken</span>
                    <textarea rows={4} value={treatmentNotes} onChange={(event) => setTreatmentNotes(event.target.value)} className="w-full rounded-none border border-[#D1D5DB] px-3 py-2 text-sm" />
                  </label>
                  {visit?.source === "referral" ? (
                    <p className="text-sm text-neutral-600">This visit came from a referral. Completing the Return Slip is a separate step and is not done here.</p>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={rhuFollowUp} onChange={(event) => setRhuFollowUp(event.target.checked)} />
                        Schedule RHU follow-up
                      </label>
                      {rhuFollowUp && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DatePickerField label="Follow-up date" value={followUpDate} onChange={(value) => { clearError("followUpDate"); setFollowUpDate(value); }} />
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Time</span>
                            <input type="time" value={followUpTime} onChange={(event) => setFollowUpTime(event.target.value)} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                          </label>
                          <label className="block text-xs sm:col-span-2">
                            <span className="mb-1 block font-semibold uppercase tracking-wide text-[#374151]">Reason</span>
                            <input value={followUpReason} onChange={(event) => setFollowUpReason(event.target.value)} className="h-9 w-full rounded-none border border-[#D1D5DB] px-3 text-sm" />
                          </label>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={manageToBhc} onChange={(event) => setManageToBhc(event.target.checked)} />
                        Manage to BHC (Active condition + recommend monitoring)
                      </label>
                    </>
                  )}
                </fieldset>
              )}
            </div>
            <div className="min-w-0">
              {currentStepKey === INTERVIEW_STEP && (
                <ConsultationProgramPanel
                  heading="Health Services"
                  description="Prenatal enrollment is optional. Clicking Enroll adds prenatal fields to this consultation. Prenatal becomes Active only after a clinician finalizes the visit."
                  programs={wizardPrograms}
                  selected={selectedPrograms}
                  primary={primaryProgram}
                  onSelect={handleProgramSelect}
                  onPrimaryChange={setPrimaryProgram}
                />
              )}
              {currentStepKey === ASSESSMENT_STEP && (
                <BodyPreviewPanel
                  findings={bodyFindings}
                  onChange={setBodyFindings}
                  dialog={bodyDialog}
                  onDialogChange={setBodyDialog}
                />
              )}
            </div>
          </div>
        )}
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
      </ConsultationWorkspaceBody>
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
    </DashboardLayout>
  );
}
