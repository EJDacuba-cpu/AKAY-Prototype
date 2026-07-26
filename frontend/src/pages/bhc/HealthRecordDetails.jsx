import { Link, useParams, useNavigate, useSearchParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FilePlus2, HeartPulse, Printer } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";

import { getPatientById } from "../../services/patientService";
import { getHealthRecordById } from "../../services/healthRecordService";
import {
  getReferralByHealthRecordId,
  getReferralByTrackingId,
} from "../../services/referrals";
import { SideCard, SoftLoadingArea } from "../../components/common";
import PatientDetailItem from "../../components/features/patients/PatientDetailItem";
import RecordHeaderCard from "../../components/features/health-records/RecordHeaderCard";
import HealthRecordClinicalDetails from "../../components/features/health-records/HealthRecordClinicalDetails";

import {
  formatDisplayValue,
  formatLongDate,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { getServiceTypeLabel } from "../../utils/healthRecordPrograms";
import {
  isImmunizationClassification,
  getRecordValue,
  getRecordVisitTypeValue,
  getParentHealthRecordId,
  getRecordDateValue,
  getRecordTime,
  getHealthRecordDetailsTitle,
  getRecordPractitioner,
} from "../../components/features/health-records/recordDetailsHelpers";

export default function HealthRecordDetails() {
  const { recordId } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);
  const [linkedReferral, setLinkedReferral] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldAutoPrint = searchParams.get("print") === "1";
  const hasAutoPrintedRef = useRef(false);


  const {
    data: details,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.healthRecordDetails("bhc", recordId),
    queryFn: async () => {
      const recordData = await getHealthRecordById(recordId);
      let existingReferral;
      try {
        existingReferral = await getReferralByHealthRecordId(recordId);
        const linkedTrackingId =
          recordData?.linkedTrackingId ||
          recordData?.linked_tracking_id ||
          recordData?.referralTrackingId ||
          recordData?.referral_tracking_id;
        if (
          !existingReferral &&
          !recordData?.isFollowUp &&
          linkedTrackingId
        ) {
          existingReferral = await getReferralByTrackingId(linkedTrackingId);
        }
      } catch {
        existingReferral = null;
      }
      const patientData = recordData?.patientId
        ? await getPatientById(recordData.patientId)
        : null;

      return { record: recordData, patient: patientData, linkedReferral: existingReferral };
    },
    enabled: Boolean(recordId),
  });

  useEffect(() => {
    if (!details) return;
    setRecord(details.record);
    setPatient(details.patient);
    setLinkedReferral(details.linkedReferral);
  }, [details]);

  useEffect(() => {
    if (!shouldAutoPrint || !record || hasAutoPrintedRef.current) return;
    hasAutoPrintedRef.current = true;

    const timer = setTimeout(() => {
      window.print();
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("print");
          return next;
        },
        { replace: true },
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [shouldAutoPrint, record, setSearchParams]);

  const loading = isLoading && !details;
  const detailsUpdating = isFetching && !loading && Boolean(details);

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <SoftLoadingArea
          isLoading
          message="Loading health record details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px] rounded-2xl border border-slate-200 bg-white shadow-sm" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-bold text-[#0F172A]">
            Health record not found
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 inline-block rounded-xl bg-[#B91C1C] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#7F1D1D]"
          >
            Go Back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const followUpDateValue = getRecordValue(record, ["followUpDate", "follow_up_date"], "");
  const isFollowUpVisitRecord = getRecordVisitTypeValue(record) === "follow_up_visit";
  const canRecordFollowUpVisit =
    Boolean(followUpDateValue) && !isFollowUpVisitRecord;
  const parentHealthRecordId = getParentHealthRecordId(record);
  const showPatientProfileSidebar = false;
  const linkedReferralTarget =
    linkedReferral?.trackingId ||
    linkedReferral?.id ||
    record.linkedTrackingId ||
    record.linked_tracking_id ||
    record.referralTrackingId ||
    record.referral_tracking_id ||
    "";
  const hasLinkedReferral = Boolean(linkedReferralTarget);
  const needsRhuReferral =
    record.needs_referral === true ||
    record.needsReferral === true ||
    record.needsReferral === "yes";
  const isImmunizationRecord = isImmunizationClassification(record, patient);
  const patientId =
    patient?.id ||
    patient?._id ||
    record.patientId ||
    record.patient_id ||
    record.patient?.id ||
    record.patient?._id;
  const patientName = formatPatientName(
    patient || record.patient,
    record.patientName || record.patient_name || "Unnamed Patient",
  );
  const serviceType = isImmunizationRecord
    ? "Child Health / EPI"
    : getServiceTypeLabel(
        {
          ...record,
          patientClassification:
            record.patientClassification ||
            patient?.category ||
            patient?.patientClassification,
        },
        "General Consultation",
      );
  const displayDate = formatLongDate(getRecordDateValue(record), "Not recorded");
  const displayTime = getRecordTime(record);
  const pageTitle = getHealthRecordDetailsTitle(serviceType);

  return (
    <>
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="min-h-[520px]">

        {/* ─── Header ─── */}
        <RecordHeaderCard
          title={pageTitle}
          recordId={recordId}
          hasLinkedReferral={hasLinkedReferral}
          referralStatus={linkedReferral?.status}
          isUpdating={detailsUpdating}
          onBack={() => navigate(-1)}
          patientName={patientName}
          serviceType={serviceType}
          displayDate={displayDate}
          displayTime={displayTime}
          practitioner={getRecordPractitioner(record)}
          isFollowUpVisit={isFollowUpVisitRecord}
          parentRecordId={parentHealthRecordId}
          actions={
            <>
              {canRecordFollowUpVisit && (
                <Link
                  to={`/bhc/health-records/add?recordId=${record.id || record._id}&mode=follow-up`}
                  title="This action creates a follow-up visit linked to the current health record."
                  aria-label="Record a follow-up visit linked to this health record"
                  className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
                >
                  <FilePlus2 size={14} />
                  Record Follow-up Visit
                </Link>
              )}
              {hasLinkedReferral && (
                <Link
                  to={`/bhc/referrals/${linkedReferralTarget}`}
                  className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  <ClipboardList size={14} />
                  View Referral
                </Link>
              )}
              {!hasLinkedReferral && needsRhuReferral && (
                <Link
                  to={`/bhc/referrals/create?recordId=${record.id || record._id}&patientId=${patientId || ""}`}
                  className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600"
                >
                  <FilePlus2 size={14} />
                  Create Referral
                </Link>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <Printer size={14} />
                Print
              </button>
            </>
          }
        />

        {/* ─── Main Content ─── */}
        <div className="space-y-5">
          {/* ═══ Clinical Record — Tabs ═══ */}
          <div className="space-y-6">
            <HealthRecordClinicalDetails
              record={record}
              patient={patient}
              linkedReferral={linkedReferral}
            />
          </div>

          {showPatientProfileSidebar && (
          <aside className="space-y-6">
            <SideCard title="Patient Profile" icon={<HeartPulse size={14} />}>
              {patient ? (
                <div>
                  <div className="space-y-1">
                    <PatientDetailItem
                      label="Full Name"
                      value={
                        patientName
                      }
                    />
                    <PatientDetailItem
                      label="Initial Registration Category"
                      value={formatDisplayValue(patient.category, "General")}
                    />
                    <PatientDetailItem
                      label="Age / Sex"
                      value={`${patient.age || "—"} yrs old / ${patient.sex || "—"}`}
                    />
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <Link
                      to={`/bhc/patients/${patient.id || patient._id}`}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-center text-xs font-semibold text-[#0F172A] shadow-sm transition hover:bg-slate-50"
                    >
                      View Full Patient Profile
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">
                  Patient data unavailable.
                </div>
              )}
            </SideCard>
          </aside>
          )}
        </div>
        </div>
      </DashboardLayout>
    </>
  );
}
