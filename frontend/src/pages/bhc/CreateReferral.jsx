import { useMemo, useRef, useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Send,
  User,
  FileText,
  Stethoscope,
  AlertTriangle,
  Printer,
  ExternalLink,
  ShieldCheck,
  Radio,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";
import ButtonSpinner from "../../components/common/loading/ButtonSpinner";
import { SoftLoadingArea } from "../../components/common";
import {
  createReferral,
  getReferralByHealthRecordId,
  getReferralByTrackingId,
  getReferralsByPatient,
} from "../../services/referrals";
import {
  getHealthRecords,
  updateHealthRecordById,
} from "../../services/healthRecordService";
import { getPatients } from "../../services/patientService";
import {
  createDoctorAvailabilitySnapshot,
  formatExpectedAvailableAt,
  getDoctorAvailability,
  listenDoctorAvailabilityUpdates,
  normalizeStatus,
} from "../../services/doctorAvailability";
import { getCurrentUser } from "../../utils/auth";
import ReferralQrCode from "../../components/features/referrals/ReferralQrCode";
import ReferralPrintSlip from "../../components/features/referrals/ReferralPrintSlip";
import { queryKeys } from "../../utils/queryKeys";
import {
  createClientSubmissionId,
  deleteReferralDraft,
  saveReferralDraft,
  updateReferralDraft,
} from "../../services/offlineDraftService";
import useOfflineDrafts from "../../hooks/useOfflineDrafts";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @keyframes pulseSoft { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes checkDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
  .anim-fade-up  { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .anim-scale-in { animation: scaleIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .pulse-soft    { animation: pulseSoft 2.5s ease-in-out infinite; }
  .check-draw    { stroke-dasharray: 24; animation: checkDraw 0.6s 0.3s ease both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

export default function CreateReferral() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const targetRecordId = searchParams.get("recordId");
  const currentUser = getCurrentUser();
  const draftScope = useMemo(
    () => ({
      userId:
        currentUser?.id ||
        currentUser?.userId ||
        currentUser?.email ||
        currentUser?.username ||
        "",
      role: currentUser?.role || "bhc",
    }),
    [currentUser],
  );
  const {
    pendingReferralDraftCount,
    refreshDrafts,
    markDraftFailed,
  } = useOfflineDrafts(draftScope);
  const referringHci =
    currentUser?.assignedBarangayHealthCenter || currentUser?.facility || "";
  const referringPractitioner = currentUser?.fullName || currentUser?.name || "";
  const assignedRhu = currentUser?.assignedRuralHealthUnit || "";

  const today = new Date().toISOString().split("T")[0];
  const currentTime = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const [patients, setPatients] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    dateOfReferral: today,
    timeOfReferral: currentTime,
    receivingFacility: assignedRhu,
    preferredVisitDate: "",
    preferredVisitTime: "",
    urgencyLevel: "Non-Urgent",
    preferredRhuDoctorId: "",
    philHealthNumber: "",
    philHealthCategory: "",
    reasonForReferral: "",
  });

  const [submitted, setSubmitted] = useState(false);
  const [checkingSubmission, setCheckingSubmission] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeReferralWarning, setActiveReferralWarning] = useState(null);
  const [submissionErrorNotice, setSubmissionErrorNotice] = useState("");
  const [showUnavailableDoctorModal, setShowUnavailableDoctorModal] =
    useState(false);
  const [unavailableDoctorNotice, setUnavailableDoctorNotice] = useState(null);
  const [generatedTrackingId, setGeneratedTrackingId] = useState("");
  const [successReferral, setSuccessReferral] = useState(null);
  const [offlineDraftNotice, setOfflineDraftNotice] = useState(null);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const retryingDraftIdsRef = useRef(new Set());
  const [rhuDoctorAvailability, setRhuDoctorAvailability] = useState(() =>
    getDoctorAvailability(),
  );

  useEffect(() => {
    async function loadReferralContext() {
      try {
        setLoading(true);

        const [patientList, records] = await Promise.all([
          getPatients(),
          getHealthRecords(),
        ]);

        setPatients(patientList);
        setHealthRecords(records);
      } catch (error) {
        console.error("Failed to load referral context:", error);
      } finally {
        setLoading(false);
      }
    }

    loadReferralContext();
  }, []);

  useEffect(() => {
    return listenDoctorAvailabilityUpdates(setRhuDoctorAvailability);
  }, []);

  useEffect(() => {
    if (!targetRecordId) return;

    const foundRecord = healthRecords.find(
      (r) => r.id === targetRecordId || r._id === targetRecordId,
    );

    if (foundRecord) {
      setRecord(foundRecord);

      const foundPatient = patients.find((p) => p.id === foundRecord.patientId);
      if (foundPatient) setPatient(foundPatient);
    }
  }, [targetRecordId, patients, healthRecords]);

  useEffect(() => {
    if (!patient) return;

    setForm((prev) => ({
      ...prev,
      philHealthNumber:
        prev.philHealthNumber ||
        patient.philHealthNumber ||
        patient.philHealth ||
        patient.philhealthNumber ||
        patient.philhealth ||
        "",
      philHealthCategory:
        prev.philHealthCategory ||
        patient.philHealthCategory ||
        patient.philhealthCategory ||
        patient.philHealthType ||
        "",
    }));
  }, [patient]);

  const recordIdDisplay = record?.id || record?._id || targetRecordId;

  const referralClassification =
    record?.category ||
    record?.recordType ||
    record?.patientClassification ||
    record?.classification ||
    patient?.category ||
    patient?.patientClassification ||
    "General Consultation";

  const patientAddress =
    [
      patient?.address || patient?.streetAddress,
      patient?.barangay,
      patient?.municipality,
    ]
      .filter(Boolean)
      .join(", ") || "—";

  const suggestedSpecialization = useMemo(() => {
    const cat = (referralClassification || "").toLowerCase();
    if (cat === "pregnant patient" || cat === "maternal")
      return "Maternal Care";
    if (cat === "children" || cat === "pediatric" || cat === "immunization")
      return "Pediatrics";
    return "General Consultation";
  }, [referralClassification]);

  const rhuDoctors = useMemo(() => {
    const rawDoctors = Array.isArray(rhuDoctorAvailability?.doctors)
      ? rhuDoctorAvailability.doctors
      : [];

    return rawDoctors.map((doctor, index) => ({
      id: doctor.doctorId || doctor.id || `DOC-${String(index + 1).padStart(3, "0")}`,
      name: doctor.doctorName || doctor.name || `Doctor ${index + 1}`,
      role:
        doctor.designation ||
        doctor.doctorType ||
        doctor.role ||
        "General Practitioner",
      status: normalizeStatus(doctor.availabilityStatus || doctor.status),
      expectedAvailableAt:
        doctor.expectedAvailableAt ||
        doctor.expected_available_at ||
        doctor.availabilityNote ||
        doctor.note ||
        "",
      note:
        doctor.expectedAvailableAt ||
        doctor.expected_available_at ||
        doctor.availabilityNote ||
        doctor.note ||
        "",
      updatedAt: doctor.updatedAt || rhuDoctorAvailability?.updatedAt || null,
    }));
  }, [rhuDoctorAvailability]);

  const totalDoctorCount = rhuDoctors.length;
  const availableDoctorCount = rhuDoctors.filter(
    (doctor) => doctor.status === "Available",
  ).length;
  const doctorAvailabilityStatus =
    availableDoctorCount > 0 ? "Available" : "Unavailable";
  const doctorAvailabilitySummary = `${availableDoctorCount} of ${totalDoctorCount} doctors available`;
  const selectedRhuDoctor = rhuDoctors.find(
    (doctor) => doctor.id === form.preferredRhuDoctorId,
  );
  const preferredRhuDoctorLabel = selectedRhuDoctor
    ? `${selectedRhuDoctor.name} · ${selectedRhuDoctor.status}`
    : "RHU to assign";

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleDoctorPreferenceChange(e) {
    const doctorId = e.target.value;
    const nextDoctor = rhuDoctors.find((doctor) => doctor.id === doctorId);

    setForm((prev) => ({ ...prev, preferredRhuDoctorId: doctorId }));

    if (nextDoctor?.status === "Unavailable") {
      setUnavailableDoctorNotice(nextDoctor);
      setShowUnavailableDoctorModal(true);
    }
  }

  function handleChooseAnotherDoctor() {
    setForm((prev) => ({ ...prev, preferredRhuDoctorId: "" }));
    setUnavailableDoctorNotice(null);
    setShowUnavailableDoctorModal(false);
  }

  function handleContinueWithUnavailableDoctor() {
    setShowUnavailableDoctorModal(false);
  }

  async function findExistingReferralForRecord() {
    const sourceRecordId = record?.id || record?._id || targetRecordId;
    return (
      (await getReferralByHealthRecordId(sourceRecordId)) ||
      (!record?.isFollowUp && record?.linkedTrackingId
        ? await getReferralByTrackingId(record.linkedTrackingId)
        : null)
    );
  }

  async function findActiveReferralForPatient() {
    if (!patient) return null;

    const referrals = await getReferralsByPatient(patient);
    return (
      referrals.find((referral) =>
        ["Pending", "Received", "For Monitoring"].includes(referral.status),
      ) || null
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (checkingSubmission || submitting) return;

    setCheckingSubmission(true);
    try {
      const existingReferral = await findExistingReferralForRecord();
      if (existingReferral?.trackingId) {
        navigate(`/bhc/referrals/${existingReferral.trackingId}`);
        return;
      }

      const activeReferral = await findActiveReferralForPatient();
      if (activeReferral) {
        setActiveReferralWarning(activeReferral);
        return;
      }

      setShowConfirmModal(true);
    } finally {
      setCheckingSubmission(false);
    }
  }

  function handleViewExistingReferral() {
    const referralTarget =
      activeReferralWarning?.trackingId || activeReferralWarning?.id;

    if (!referralTarget) return;

    setActiveReferralWarning(null);
    navigate(`/bhc/referrals/${referralTarget}`);
  }

  async function confirmReferralSubmission() {
    if (submitting) return;

    setSubmitting(true);
    let referralPayload = null;

    try {
    const existingReferral = await findExistingReferralForRecord();
    if (existingReferral?.trackingId) {
      setShowConfirmModal(false);
      navigate(`/bhc/referrals/${existingReferral.trackingId}`);
      return;
    }

    const availabilitySnapshot = createDoctorAvailabilitySnapshot(
      rhuDoctorAvailability,
    );
    const clientSubmissionId = createClientSubmissionId();

    referralPayload = {
      clientSubmissionId,
      patientId: patient?.id,
      patientName: patient?.name,
      ageSex:
        patient?.ageSex || `${patient?.age || ""} / ${patient?.sex || ""}`,
      dateOfReferral: form.dateOfReferral,
      timeOfReferral: form.timeOfReferral,

      // Correct BHC → RHU facility direction.
      // Referring facility must be the Barangay Health Center.
      bhc: referringHci,
      referringFacility: referringHci,
      referringHci,
      barangayHealthCenterId: currentUser?.barangayHealthCenterId || "",

      // Receiving facility for the BHC → RHU referral.
      receivingFacility: form.receivingFacility,
      referredFacility: form.receivingFacility, // backward compatibility
      destinationFacility: form.receivingFacility,
      ruralHealthUnitId: currentUser?.ruralHealthUnitId || "",

      // Category is based on the linked health record, with patient fallback for old data.
      referralCategory: referralClassification,
      category: referralClassification,
      classification: referralClassification,

      // Urgency is chosen by BHC staff.
      urgency: form.urgencyLevel,
      urgencyLevel: form.urgencyLevel,

      // Backward compatibility for older RHU pages that still read priority.
      priorityLevel: form.urgencyLevel,
      priority: form.urgencyLevel,

      // RHU doctor availability is advisory only and comes from RHU.
      doctorAvailability: doctorAvailabilityStatus,
      rhuDoctorAvailability: doctorAvailabilityStatus,
      doctorAvailabilityStatus,
      doctorAvailabilitySummary,
      availableDoctorCount,
      totalDoctorCount,
      doctorAvailabilityUpdatedAt: rhuDoctorAvailability?.updatedAt || null,
      doctorAvailabilityUpdatedBy:
        rhuDoctorAvailability?.updatedBy || "RHU Staff",
      doctorAvailabilitySnapshot: availabilitySnapshot,

      // BHC may indicate a preferred RHU doctor, but RHU can still reassign.
      preferredRhuDoctorId: selectedRhuDoctor?.id || "",
      preferredRhuDoctorName: selectedRhuDoctor?.name || "RHU to assign",
      preferredRhuDoctorRole:
        selectedRhuDoctor?.role ||
        rhuDoctorAvailability?.doctorType ||
        "General Practitioner",
      preferredRhuDoctorStatus: selectedRhuDoctor?.status || "",
      preferredRhuDoctorNote: selectedRhuDoctor?.note || "",

      // Optional supporting patient information.
      philHealthNumber: form.philHealthNumber.trim(),
      philHealthCategory: form.philHealthCategory,
      patientPhilHealthNumber: form.philHealthNumber.trim(),
      patientPhilHealthCategory: form.philHealthCategory,

      healthRecordId: record?.id || record?._id,
      recordId: record?.id || record?._id,

      // RHU IncomingReferrals uses `chiefComplaint || concern`.
      chiefComplaint: record?.chiefComplaint,
      concern: record?.chiefComplaint,

      diagnosis: record?.diagnosis || record?.assessment,
      reasonForReferral: form.reasonForReferral,
      summaryOfPresentIllness: record?.summaryOfPresentIllness,
      initialActionsTaken: record?.actiontaken || record?.medication,
      attendingStaff: record?.attendingStaff,
      practitioner: referringPractitioner,
      suggestedSpecialization,
    };

    const referral = await createReferral(referralPayload);

    if (record?.id || record?._id) {
      await updateHealthRecordById(
        record.id || record._id,
        {
          linkedTrackingId: referral.trackingId,
          referralTrackingId: referral.trackingId,
        },
        "bhc",
      );
    }

    setShowConfirmModal(false);
    showSuccessfulReferral(referral, referralPayload);
    } catch (error) {
      if (referralPayload && isNetworkSubmissionError(error)) {
        const draft = await saveReferralDraft({
          ...draftScope,
          patientId: patient?.id,
          healthRecordId: record?.id || record?._id || targetRecordId,
          payload: referralPayload,
          errorMessage:
            "Internet connection lost before this referral reached the backend.",
        });
        await refreshDrafts();
        setShowConfirmModal(false);
        setOfflineDraftNotice({
          draft,
          message:
            "Internet connection lost. This referral was saved as a local draft and has not been submitted to the RHU yet. Please retry when the connection is restored.",
          errorMessage: "",
        });
        return;
      }

      console.error("Failed to submit referral:", error);
      setSubmissionErrorNotice("Referral failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retryOfflineDraft(draft = offlineDraftNotice?.draft) {
    const localDraftId = draft?.localDraftId;
    if (!draft || !localDraftId || retryingDraftIdsRef.current.has(localDraftId))
      return;

    retryingDraftIdsRef.current.add(localDraftId);
    setRetryingDraft(true);
    let draftForRetry = draft;
    try {
      const clientSubmissionId =
        draft.clientSubmissionId ||
        draft.payload?.clientSubmissionId ||
        draft.payload?.client_submission_id ||
        createClientSubmissionId();

      if (
        !draft.clientSubmissionId ||
        !draft.payload?.clientSubmissionId ||
        draft.payload?.clientSubmissionId !== clientSubmissionId
      ) {
        const updatedDraft = await updateReferralDraft(localDraftId, {
          clientSubmissionId,
          payload: {
            ...draft.payload,
            clientSubmissionId,
          },
          errorMessage: "",
        });
        draftForRetry =
          updatedDraft || {
            ...draft,
            clientSubmissionId,
            payload: {
              ...draft.payload,
              clientSubmissionId,
            },
          };
      }

      const referral = await createReferral(draftForRetry.payload);

      if (draftForRetry.healthRecordId) {
        await updateHealthRecordById(
          draftForRetry.healthRecordId,
          {
            linkedTrackingId: referral.trackingId,
            referralTrackingId: referral.trackingId,
          },
          "bhc",
        );
      }

      await deleteReferralDraft(draftForRetry.localDraftId);
      await refreshDrafts();
      setOfflineDraftNotice(null);
      showSuccessfulReferral(referral, draftForRetry.payload);
    } catch (error) {
      const errorMessage = isNetworkSubmissionError(error)
        ? "Still offline. This referral remains saved as a local draft and has not been submitted."
        : error?.message || "Retry failed. This draft is still pending sync.";
      await updateReferralDraft(localDraftId, { errorMessage });
      await markDraftFailed(localDraftId, errorMessage);
      setOfflineDraftNotice((prev) => ({
        ...(prev || {}),
        draft: draftForRetry,
        errorMessage,
      }));
    } finally {
      retryingDraftIdsRef.current.delete(localDraftId);
      setRetryingDraft(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Submit Referral">
        <SoftLoadingArea
          isLoading
          message="Loading details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-[#E8ECF0] bg-white shadow-sm" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  function isNetworkSubmissionError(error) {
    if (navigator && navigator.onLine === false) return true;
    const message = String(error?.message || "").toLowerCase();
    return (
      error instanceof TypeError ||
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("offline") ||
      message.includes("internet")
    );
  }

  function invalidateReferralCaches(savedReferral = {}) {
    queryClient.invalidateQueries({ queryKey: queryKeys.referrals("bhc") });
    queryClient.invalidateQueries({
      queryKey: queryKeys.incomingReferrals("rhu"),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboardSummary("bhc"),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.dashboardSummary("rhu"),
    });
    if (patient?.id) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.patientDetails("bhc", patient.id),
      });
    }
    const sourceRecordId = savedReferral.healthRecordId || record?.id || record?._id;
    if (sourceRecordId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecordDetails("bhc", sourceRecordId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.healthRecords("bhc"),
      });
    }
  }

  function showSuccessfulReferral(referral, sourcePayload = {}) {
    const savedTrackingId =
      referral.trackingId || referral.tracking_id || referral.id;

    setGeneratedTrackingId(savedTrackingId);
    setSuccessReferral({
      ...referral,
      trackingId: savedTrackingId,
      patientName: referral.patientName || patient?.name || sourcePayload.patientName,
      referringHci,
      receivingFacility:
        referral.receivingFacility ||
        referral.destinationFacility ||
        referral.referredFacility ||
        sourcePayload.receivingFacility ||
        form.receivingFacility,
      urgencyLevel:
        referral.urgencyLevel ||
        referral.urgency ||
        sourcePayload.urgencyLevel ||
        form.urgencyLevel,
      referralDateTime:
        referral.referralDateTime ||
        sourcePayload.referralDateTime ||
        `${form.dateOfReferral} ${form.timeOfReferral || "00:00"}`,
      preferredRhuDoctorName:
        referral.preferredRhuDoctorName ||
        sourcePayload.preferredRhuDoctorName ||
        selectedRhuDoctor?.name ||
        "RHU to assign",
      preferredRhuDoctorStatus:
        referral.preferredRhuDoctorStatus ||
        sourcePayload.preferredRhuDoctorStatus ||
        selectedRhuDoctor?.status ||
        "",
      philHealthNumber:
        referral.philHealthNumber ||
        referral.patientPhilHealthNumber ||
        sourcePayload.philHealthNumber ||
        form.philHealthNumber.trim(),
      philHealthCategory:
        referral.philHealthCategory ||
        referral.patientPhilHealthCategory ||
        sourcePayload.philHealthCategory ||
        form.philHealthCategory,
    });
    setSubmitted(true);
    invalidateReferralCaches(referral);
  }

  /* ─── Error: No Context ─── */
  if (!targetRecordId || !record) {
    return (
      <DashboardLayout role="bhc" title="Submit Referral">
        <style>{keyframes}</style>
        <div className="anim-fade-up mx-auto max-w-lg py-24 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Missing Context</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500 mx-auto">
            Referrals must be initiated from an existing Health Record
            consultation. Please go to a patient&apos;s Health Record details
            and click &quot;Submit Referral&quot;.
          </p>
          <Link
            to="/bhc/health-records"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
          >
            Go to Health Records
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Success Screen ─── */
  if (submitted && !successReferral) {
    const submittedReferral = {
      trackingId: generatedTrackingId,
      patientName: patient?.name,
      referringHci,
      receivingFacility: form.receivingFacility,
      urgencyLevel: form.urgencyLevel,
      referralDateTime: `${form.dateOfReferral} ${form.timeOfReferral || "00:00"}`,
    };

    return (
      <DashboardLayout role="bhc" title="Referral Transmitted">
        <style>{keyframes}</style>
        <div className="mx-auto max-w-2xl py-10">
          <div className="anim-fade-up mb-8 text-center" style={stagger(0)}>
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 anim-scale-in"
              style={stagger(1)}
            >
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path
                  className="check-draw"
                  d="M10 16.5L14 20.5L22 12.5"
                  stroke="#059669"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800">
              Referral sent.
            </h1>
            <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
              The consultation has been securely transmitted to the receiving
              facility for review and scheduling.
            </p>
          </div>

          <div
            className="anim-fade-up rounded-2xl border border-slate-200 bg-white overflow-hidden"
            style={stagger(2)}
          >
            <div className="bg-[#B91C1C] px-6 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-red-200" />
                <span className="text-[11px] font-semibold text-red-100 tracking-wide uppercase">
                  Referral Verification
                </span>
              </div>
            </div>
            <div className="flex flex-col items-center p-8">
              <ReferralQrCode
                trackingId={generatedTrackingId}
                size={144}
                className="rounded-xl border border-slate-200 p-2"
                imageClassName="h-36 w-36"
              />
              <p className="mt-4 font-mono text-sm font-bold text-slate-700 tracking-widest">
                {generatedTrackingId}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Scan QR for referral verification
              </p>
            </div>
          </div>

          <div
            className="anim-fade-up mt-4 rounded-2xl border border-slate-200 bg-white p-6"
            style={stagger(3)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="Tracking ID" value={generatedTrackingId} mono />
              <Info label="Patient" value={patient?.name || "—"} highlight />
              <Info
                label="Receiving Facility"
                value={form.receivingFacility}
                highlight
              />
              <Info label="Urgency" value={form.urgencyLevel} />
              <Info
                label="Preferred RHU Doctor (Optional)"
                value={preferredRhuDoctorLabel}
              />
              <Info
                label="PhilHealth"
                value={
                  form.philHealthNumber
                    ? `${form.philHealthNumber}${
                        form.philHealthCategory
                          ? ` · ${form.philHealthCategory}`
                          : ""
                      }`
                    : "Not provided"
                }
              />
            </div>
          </div>

          <div
            className="anim-fade-up mt-6 flex justify-center gap-3"
            style={stagger(4)}
          >
            <button
              onClick={() => navigate("/bhc/referrals")}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Go to Referrals
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Printer size={14} /> Print Slip
            </button>
          </div>

          <ReferralPrintSlip
            referral={submittedReferral}
            patient={patient}
            printOnly
          />
        </div>
      </DashboardLayout>
    );
  }

  /* ─── Main Form ─── */
  const submittedReferral = successReferral
    ? {
        ...successReferral,
        trackingId: generatedTrackingId || successReferral.trackingId,
      }
    : null;
  const successTrackingId = submittedReferral?.trackingId || "";
  const successPreferredDoctor =
    submittedReferral?.preferredRhuDoctorName &&
    submittedReferral.preferredRhuDoctorName !== "RHU to assign"
      ? `${submittedReferral.preferredRhuDoctorName}${
          submittedReferral.preferredRhuDoctorStatus
            ? ` · ${submittedReferral.preferredRhuDoctorStatus}`
            : ""
        }`
      : preferredRhuDoctorLabel;
  const successPhilHealth = submittedReferral?.philHealthNumber
    ? `${submittedReferral.philHealthNumber}${
        submittedReferral.philHealthCategory
          ? ` · ${submittedReferral.philHealthCategory}`
          : ""
      }`
    : submittedReferral?.philHealthCategory || "Not provided";

  const activeReferralTarget =
    activeReferralWarning?.trackingId || activeReferralWarning?.id || "";
  const activeReferralDestination =
    activeReferralWarning?.receivingFacility ||
    activeReferralWarning?.destinationFacility ||
    activeReferralWarning?.referredFacility ||
    "—";
  const activeReferralDate =
    activeReferralWarning?.referralDateTime ||
    activeReferralWarning?.date ||
    activeReferralWarning?.createdAt ||
    "—";

  return (
    <DashboardLayout role="bhc" title="Submit Referral">
      <style>{keyframes}</style>

      {activeReferralWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-5 backdrop-blur-sm">
          <div className="anim-scale-in w-full max-w-xl overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="h-1 bg-amber-500" />

            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Active Referral Already Exists
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    This patient already has an active BHC-RHU referral. Please
                    review the existing referral before creating another
                    referral.
                  </p>
                </div>
              </div>

              {activeReferralTarget && (
                <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Info
                      label="Tracking ID"
                      value={activeReferralWarning.trackingId || "—"}
                      mono
                    />
                    <Info
                      label="Status"
                      value={activeReferralWarning.status || "—"}
                      highlight
                    />
                    <Info
                      label="Referred To"
                      value={activeReferralDestination}
                    />
                    <Info label="Date of Referral" value={activeReferralDate} />
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveReferralWarning(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                {activeReferralTarget && (
                  <button
                    type="button"
                    onClick={handleViewExistingReferral}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    View Existing Referral
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {submissionErrorNotice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-5 backdrop-blur-sm">
          <div className="anim-scale-in w-full max-w-md overflow-hidden rounded-2xl border border-red-100 bg-white shadow-2xl">
            <div className="h-1 bg-[#B91C1C]" />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Referral failed.
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {submissionErrorNotice}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSubmissionErrorNotice("")}
                  className="rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm Modal ─── */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4 py-5 backdrop-blur-sm">
          <div className="anim-scale-in flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="h-1 bg-[#B91C1C]" />

            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[#B91C1C]">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Review referral
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Check the key details before sending this referral to the
                    RHU.
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Patient" value={patient?.name} highlight />
                <Info
                  label="Age / Sex"
                  value={
                    patient?.ageSex ||
                    (patient?.age ? `${patient.age} yrs / ${patient.sex}` : "—")
                  }
                />
                <Info
                  label="Receiving Facility"
                  value={form.receivingFacility}
                />
                <Info label="Urgency" value={form.urgencyLevel} highlight />
                <Info
                  label="Preferred RHU Doctor (Optional)"
                  value={preferredRhuDoctorLabel}
                />
                <Info
                  label="Consultation Record"
                  value={recordIdDisplay}
                  mono
                />
                <div className="sm:col-span-2">
                  <Info
                    label="Reason for Referral"
                    value={form.reasonForReferral || "Not provided"}
                  />
                </div>
              </div>

              {selectedRhuDoctor?.status === "Unavailable" && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                    Doctor Availability Notice
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    <span className="font-semibold text-slate-900">
                      {selectedRhuDoctor.name}
                    </span>{" "}
                    is currently unavailable
                    {selectedRhuDoctor.note
                      ? ` — ${selectedRhuDoctor.note}`
                      : " — No note provided."}
                  </p>
                  <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                    RHU may assign another available doctor upon receiving the
                    patient. Referral submission is still allowed.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={confirmReferralSubmission}
                disabled={submitting}
                className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? <ButtonSpinner /> : <Send size={14} />}
                {submitting ? "Submitting..." : "Submit Referral"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Unavailable Doctor Notice Modal ─── */}
      {showUnavailableDoctorModal && unavailableDoctorNotice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4 py-5 backdrop-blur-sm">
          <div className="anim-scale-in w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="h-1 bg-amber-500" />

            <div className="p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Doctor Currently Unavailable
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    RHU staff marked this doctor as unavailable.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-sm font-bold text-slate-900">
                  {unavailableDoctorNotice.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {unavailableDoctorNotice.role || "General Practitioner"}
                </p>

                <div className="mt-3 rounded-lg bg-white/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                    Expected Available At
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    {unavailableDoctorNotice.expectedAvailableAt
                      ? formatExpectedAvailableAt(
                          unavailableDoctorNotice.expectedAvailableAt,
                        )
                      : "Not specified."}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                You may choose another doctor, or continue anyway. RHU staff may
                assign another available doctor after receiving the patient.
              </p>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={handleChooseAnotherDoctor}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Choose Another Doctor
                </button>
                <button
                  type="button"
                  onClick={handleContinueWithUnavailableDoctor}
                  className="rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
                >
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Page Content ─── */}
      {submitted && submittedReferral && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-5 backdrop-blur-sm print:hidden">
          <div className="anim-scale-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="h-1 bg-emerald-500" />

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={30} strokeWidth={2.4} />
                </div>
                <h2 className="mt-4 text-xl font-bold text-slate-900">
                    Referral sent.
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  The consultation has been transmitted to the receiving
                  facility. Use the tracking ID or QR code for verification and
                  follow-up.
                </p>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="bg-[#B91C1C] px-5 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-red-100" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-red-50">
                      Referral Verification
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center px-5 py-6">
                  <ReferralQrCode
                    trackingId={successTrackingId}
                    size={148}
                    className="rounded-xl border border-slate-200 p-2"
                    imageClassName="h-36 w-36"
                  />
                  <p className="mt-4 font-mono text-sm font-bold tracking-widest text-slate-800">
                    {successTrackingId}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Scan QR for referral verification
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Info label="Tracking ID" value={successTrackingId} mono />
                  <Info
                    label="Patient"
                    value={submittedReferral.patientName || patient?.name}
                    highlight
                  />
                  <Info
                    label="Urgency"
                    value={
                      submittedReferral.urgencyLevel ||
                      submittedReferral.urgency ||
                      form.urgencyLevel
                    }
                    highlight
                  />
                  <Info
                    label="Receiving Facility"
                    value={submittedReferral.receivingFacility}
                    highlight
                  />
                  <Info
                    label="Preferred RHU Doctor (Optional)"
                    value={successPreferredDoctor}
                  />
                  <Info label="PhilHealth" value={successPhilHealth} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4">
              <button
                type="button"
                onClick={() => navigate("/bhc/referrals")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Go to Referrals
              </button>
              <button
                type="button"
                onClick={() => navigate(`/bhc/referrals/${successTrackingId}`)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                View Details
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B]"
              >
                <Printer size={14} />
                Print Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {offlineDraftNotice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 px-4 py-5 backdrop-blur-sm">
          <div className="anim-scale-in w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="h-1 bg-amber-500" />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <AlertTriangle size={21} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Saved as Draft / Pending Sync
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {offlineDraftNotice.message}
                  </p>
                  {offlineDraftNotice.errorMessage && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      {offlineDraftNotice.errorMessage}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOfflineDraftNotice(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Continue Editing
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/bhc/referrals")}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Back to Referrals
                </button>
                <button
                  type="button"
                  disabled={retryingDraft}
                  onClick={() => retryOfflineDraft()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {retryingDraft ? <ButtonSpinner /> : <Send size={14} />}
                  {retryingDraft ? "Retrying..." : "Retry Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pb-12">
        {/* Header */}
        <div className="anim-fade-up mb-3" style={stagger(0)}>
          <Link
            to="/bhc/health-records"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-500 hover:text-[#0F172A]"
          >
            <ArrowLeft size={15} /> Back to Health Records
          </Link>
        </div>

        <header
          className="anim-fade-up mb-5 border-b border-slate-200 pb-5"
          style={stagger(1)}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
                  Submit Referral
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1">
                  <ClipboardList size={11} className="text-[#B91C1C]/60" />
                  <span className="font-mono text-[11px] font-semibold text-[#B91C1C]/80">
                    {recordIdDisplay}
                  </span>
                </span>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-500">
                Review the consultation context and configure referral details
                for the receiving facility.
              </p>
            </div>
          </div>
        </header>

        {pendingReferralDraftCount > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            You have {pendingReferralDraftCount} unsent referral draft
            {pendingReferralDraftCount === 1 ? "" : "s"}. Status: Pending sync.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 rounded-2xl border border-[#E8ECF0] bg-white px-5 py-6 shadow-sm sm:px-6 lg:px-8">
          {/* ═══════════════════════════════════
              SECTION 1: Referral Information
          ═══════════════════════════════════ */}
          <FormDocument
            title="Referral Information"
            subtitle="Configure destination facility and referral details"
            icon={<Send size={14} />}
            delay={1}
          >
            <SectionDivider label="Referral Tracking Details" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3 md:grid-cols-4">
              <MetaField label="Name Of Referring HCI" value={referringHci} />
              <MetaField
                label="Referring Practitioner"
                value={referringPractitioner}
              />
              <MetaField label="Date of Referral" value={form.dateOfReferral} />
              <MetaField label="Time of Referral" value={form.timeOfReferral} />
            </div>

            <SectionDivider label="Receiving Facility & RHU Coordination" />
            <div className="grid gap-4 pt-3 pb-1 lg:grid-cols-2">
              <FieldInput
                label="Receiving Facility"
                name="receivingFacility"
                value={form.receivingFacility}
                onChange={handleChange}
                required
              />

              <RhuDoctorPreferenceSelect
                doctors={rhuDoctors}
                selectedDoctorId={form.preferredRhuDoctorId}
                selectedDoctor={selectedRhuDoctor}
                onChange={handleDoctorPreferenceChange}
              />
            </div>

            <SectionDivider label="Urgency Level" />
            <div className="pt-3 pb-1">
              <RadioCardGroup
                label="Select referral urgency"
                name="urgencyLevel"
                value={form.urgencyLevel}
                onChange={handleChange}
                options={[
                  {
                    value: "Non-Urgent",
                    title: "Non-Urgent",
                    description: "Routine referral; patient is stable.",
                  },
                  {
                    value: "Urgent",
                    title: "Urgent",
                    description: "Needs timely RHU assessment.",
                  },
                  {
                    value: "Emergency",
                    title: "Emergency",
                    description: "Requires immediate RHU attention.",
                  },
                ]}
              />
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 2: Patient Information
          ═══════════════════════════════════ */}
          <FormDocument
            title="Patient Information"
            subtitle="Linked patient demographic overview"
            icon={<User size={14} />}
            headerRight={
              <Link
                to={`/bhc/patients/${patient?.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-red-200 hover:text-[#B91C1C]"
              >
                <ExternalLink size={11} /> Open Patient Details
              </Link>
            }
            delay={2}
          >
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3 pb-1">
              <MetaField
                label="Name Of Patient"
                value={patient?.name || "—"}
                bold
              />
              <MetaField label="Date of Birth" value={patient?.dob || "—"} />
              <MetaField label="Address" value={patientAddress} span />
              <MetaField
                label="Age / Sex"
                value={
                  patient?.ageSex ||
                  (patient?.age ? `${patient.age} yrs / ${patient.sex}` : "—")
                }
              />
              <MetaField
                label="Patient Classification"
                value={referralClassification}
              />
            </div>

            <SectionDivider label="PhilHealth Information Optional" />
            <div className="grid gap-4 pt-3 pb-1 sm:grid-cols-2">
              <FieldInput
                label="PhilHealth Number"
                name="philHealthNumber"
                value={form.philHealthNumber}
                onChange={handleChange}
                placeholder="Enter PhilHealth number if available"
              />

              <FieldSelect
                label="PhilHealth Category"
                name="philHealthCategory"
                value={form.philHealthCategory}
                onChange={handleChange}
              >
                <option value="">Not provided</option>
                <option value="Member">Member</option>
                <option value="Dependent">Dependent</option>
                <option value="Indigent">Indigent</option>
                <option value="Senior Citizen">Senior Citizen</option>
                <option value="Sponsored">Sponsored</option>
                <option value="Lifetime Member">Lifetime Member</option>
                <option value="Not Applicable">Not Applicable</option>
              </FieldSelect>
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 3: Clinical Assessment
          ═══════════════════════════════════ */}
          <FormDocument
            title="Clinical Assessment"
            subtitle="Key findings from the linked consultation record"
            icon={<FileText size={14} />}
            headerRight={
              <Link
                to={`/bhc/health-records/${record.id || record._id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:border-red-200 hover:text-[#B91C1C]"
              >
                <ExternalLink size={11} /> Open Full Consultation
              </Link>
            }
            delay={3}
          >
            <SectionDivider label="Consultation Details" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 pt-3">
              <MetaField
                label="Date / Time"
                value={`${record.dateOfVisit} at ${record.timeOfVisit || "—"}`}
              />
              <MetaField
                label="Attending Staff"
                value={record.attendingStaff || "—"}
              />
            </div>

            <SectionDivider label="Chief Complaint" />
            <div className="pt-3">
              <NarrativeField
                value={record.chiefComplaint}
                emptyText="No chief complaint recorded."
              />
            </div>

            <SectionDivider label="Summary of Present Illness & Physical Examination" />
            <div className="pt-3">
              <NarrativeField
                value={record.summaryOfPresentIllness}
                emptyText="No summary of present illness or physical examination documented."
              />
            </div>

            <SectionDivider label="Initial Diagnosis" />
            <div className="pt-3">
              <NarrativeField
                value={record.diagnosis || record.assessment}
                emptyText="No initial diagnosis recorded."
              />
            </div>

            <SectionDivider label="Initial Actions Taken" />
            <div className="pt-3 pb-1">
              <NarrativeField
                value={record.actiontaken || record.medication}
                emptyText="No initial actions taken recorded."
              />
            </div>
          </FormDocument>

          {/* ═══════════════════════════════════
              SECTION 4: Clinical Escalation Notes
          ═══════════════════════════════════ */}
          <FormDocument
            title="Clinical Escalation Notes"
            subtitle="Document the clinical reasoning for this referral"
            icon={<Stethoscope size={14} />}
            delay={4}
          >
            <div className="pt-3 pb-1">
              <FieldTextarea
                label="Reason for Referral"
                name="reasonForReferral"
                value={form.reasonForReferral}
                onChange={handleChange}
                placeholder="State the specific clinical triggers or referral reasons based on the consultation..."
                required
              />
            </div>
          </FormDocument>

          {/* ─── Actions ─── */}
          <div
            className="anim-fade-up flex items-center justify-between pt-5"
            style={stagger(5)}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={checkingSubmission || submitting}
                className="flex items-center gap-2 rounded-xl bg-[#B91C1C] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {checkingSubmission || submitting ? (
                  <ButtonSpinner />
                ) : (
                  <Send size={14} />
                )}
                {checkingSubmission || submitting
                  ? "Submitting..."
                  : "Submit Referral Slip"}
              </button>
            </div>
          </div>
          </div>
        </form>
      </div>

      {submittedReferral && (
        <ReferralPrintSlip
          referral={submittedReferral}
          patient={patient}
          printOnly
        />
      )}
    </DashboardLayout>
  );
}

/* ─────────────────────────────────────────────
   LAYOUT COMPONENTS
──────────────────────────────────────────── */

function FormDocument({ title, subtitle, icon, headerRight, children, delay }) {
  return (
    <div
      className="anim-fade-up pb-5 last:pb-0"
      style={stagger(delay)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-red-50 text-[#B91C1C]">
            {icon}
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-slate-800">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {headerRight}
      </div>
      <div className="py-1">{children}</div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 pt-5 first:pt-3">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FIELD COMPONENTS
──────────────────────────────────────────── */

function MetaField({ label, value, mono, bold, span }) {
  let display = (
    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-slate-700">
      {value || "—"}
    </p>
  );
  if (bold)
    display = (
      <p className="mt-0.5 text-[13px] font-bold leading-relaxed text-slate-800">
        {value || "—"}
      </p>
    );
  if (mono)
    display = (
      <p className="mt-0.5 font-mono text-[13px] font-bold text-[#B91C1C]">
        {value}
      </p>
    );

  return (
    <div className={`py-1 ${span ? "md:col-span-2" : ""}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {display}
    </div>
  );
}

function Info({ label, value, mono, highlight }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed ${
          mono ? "font-mono" : ""
        } ${
          highlight ? "font-bold text-slate-800" : "font-medium text-slate-700"
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function FieldInput({
  label,
  name,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    </div>
  );
}

function FieldSelect({ label, name, value, onChange, children, required }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#1F2937] outline-none transition-all focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      >
        {children}
      </select>
    </div>
  );
}

function FieldTextarea({
  label,
  name,
  value,
  onChange,
  placeholder,
  required,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        rows={5}
        className="w-full resize-none rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm leading-relaxed text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10"
      />
    </div>
  );
}

function RhuDoctorPreferenceSelect({
  doctors,
  selectedDoctorId,
  selectedDoctor,
  onChange,
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Preferred RHU Doctor (Optional)
      </label>

      <select
        name="preferredRhuDoctorId"
        value={selectedDoctorId}
        onChange={onChange}
        className={`h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-800 outline-none transition-all focus:border-[#B91C1C] focus:ring-2 focus:ring-[#B91C1C]/10 ${
          selectedDoctor?.status === "Unavailable"
            ? "border-amber-300"
            : "border-slate-200"
        }`}
      >
        <option value="">RHU to assign</option>
        {doctors.map((doctor) => {
          const unavailable = doctor.status === "Unavailable";
          const doctorStatusLabel =
            unavailable && doctor.expectedAvailableAt
              ? `Unavailable until ${formatExpectedAvailableAt(
                  doctor.expectedAvailableAt,
                )}`
              : doctor.status;

          return (
            <option key={doctor.id} value={doctor.id} disabled={unavailable}>
              {doctor.name} - {doctorStatusLabel}
            </option>
          );
        })}
      </select>

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        Advisory only. RHU may assign the final attending doctor upon receiving
        the patient.
      </p>
    </div>
  );
}

function RadioCardGroup({ label, name, value, onChange, options }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Radio size={11} />
        {label}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const active = value === option.value;

          return (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={onChange}
                className="mt-0.5 h-4 w-4 accent-[#B91C1C]"
              />

              <span>
                <span
                  className={`block text-xs font-bold ${
                    active ? "text-[#B91C1C]" : "text-slate-700"
                  }`}
                >
                  {option.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CLINICAL DISPLAY
──────────────────────────────────────────── */

function NarrativeField({ value, emptyText }) {
  if (!value) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/30 px-4 py-6 text-center">
        <p className="text-xs text-slate-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {value}
      </p>
    </div>
  );
}
