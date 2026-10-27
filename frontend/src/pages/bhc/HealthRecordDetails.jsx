import { useLocation, useParams, useNavigate, useSearchParams } from "react-router";
import { getPatientRecordReturn } from "../../utils/profileNavigation";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import DashboardLayout from "../../components/layout/DashboardLayout";

import { getPatientById } from "../../services/patientService";
import { getHealthRecordById } from "../../services/healthRecordService";
import {
  getReferralByHealthRecordId,
  getReferralByTrackingId,
} from "../../services/referrals";
import {
  ConnectionErrorState,
  SoftLoadingArea,
} from "../../components/common";
import BhcHealthRecordWorkspace from "../../components/features/health-records/BhcHealthRecordWorkspace";
import { BodyFindingRecordHistory } from "../../components/features/health-records/BodyFindingReassessment";
import BhcHealthRecordPrintDocument, {
  BHC_HEALTH_RECORD_PRINT_PAGE_STYLES,
} from "../../components/features/health-records/BhcHealthRecordPrintDocument";
import { Button } from "../../components/ui/button";

import {
  formatLongDate,
  formatPatientName,
} from "../../utils/formatters";
import { queryKeys } from "../../utils/queryKeys";
import { getServiceTypeLabel } from "../../utils/healthRecordPrograms";
import {
  isImmunizationClassification,
  getRecordVisitTypeValue,
  getParentHealthRecordId,
  getRecordDateValue,
  getRecordTime,
  getHealthRecordDetailsTitle,
  getRecordPractitioner,
} from "../../components/features/health-records/recordDetailsHelpers";
import { errorStateVariant } from "../../utils/errorStateVariant";

export default function HealthRecordDetails() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams, setSearchParams] = useSearchParams();
  const shouldAutoPrint = searchParams.get("print") === "1";
  const hasAutoPrintedRef = useRef(false);

  const {
    data: details,
    error,
    isLoading,
    isFetching,
    refetch,
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
      let patientData = recordData?.patient || null;
      if (recordData?.patientId) {
        try {
          patientData = await getPatientById(recordData.patientId);
        } catch {
          patientData = recordData?.patient || null;
        }
      }

      return { record: recordData, patient: patientData, linkedReferral: existingReferral };
    },
    enabled: Boolean(recordId),
    retry: (failureCount, requestError) =>
      requestError?.status !== 404 && failureCount < 2,
  });

  const record = details?.record || (details?.id ? details : null);
  const patient = details?.patient || record?.patient || null;
  const linkedReferral = details?.linkedReferral || null;
  function returnToProfile() {
    if (!location.state?.patientProfile && window.history.state?.idx > 0) {
      navigate(-1);
      return;
    }
    const target = getPatientRecordReturn(location, patient?.id || record?.patientId || record?.patient_id);
    navigate(target.path, { replace: true, state: target.state });
  }

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
        { replace: true, state: location.state },
      );
    }, 250);

    return () => clearTimeout(timer);
  }, [shouldAutoPrint, record, setSearchParams, location.state]);

  const loading = isLoading || (!details && isFetching);
  const detailsUpdating = isFetching && !loading && Boolean(details);

  if (loading) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <SoftLoadingArea skeleton="details"
          isLoading
          message="Loading health record details..."
          minHeight="min-h-[520px]"
        >
          <div className="min-h-[520px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (error && error?.status !== 404) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <ConnectionErrorState
          fullPage
          onRetry={() => refetch()}
          retrying={isFetching}
          variant={errorStateVariant(error)}
        />
      </DashboardLayout>
    );
  }

  if (!record) {
    return (
      <DashboardLayout role="bhc" title="Health Record Details">
        <div className="mx-auto max-w-md rounded-card border border-neutral-200/80 bg-white p-10 text-center shadow-card">
          <h1 className="text-xl font-bold text-neutral-900">
            Health record not found
          </h1>
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={returnToProfile}
            className="mt-4 h-9"
          >
            Go Back
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const isFollowUpVisitRecord = getRecordVisitTypeValue(record) === "follow_up_visit";
  const parentHealthRecordId = getParentHealthRecordId(record);
  const linkedReferralTarget =
    linkedReferral?.trackingId ||
    linkedReferral?.id ||
    record.linkedTrackingId ||
    record.linked_tracking_id ||
    record.referralTrackingId ||
    record.referral_tracking_id ||
    "";
  const hasLinkedReferral = Boolean(linkedReferralTarget);
  const isImmunizationRecord = isImmunizationClassification(record, patient);
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
  const parentRecordId = parentHealthRecordId;

  return (
    <DashboardLayout role="bhc" title="Health Record Details">
      <style>{BHC_HEALTH_RECORD_PRINT_PAGE_STYLES}</style>
      <div className="min-h-[520px]">
        <div className="print:hidden">
          <BhcHealthRecordWorkspace
            record={record}
            patient={patient}
            linkedReferral={linkedReferral}
            title={pageTitle}
            recordId={recordId}
            patientName={patientName}
            serviceType={serviceType}
            displayDate={displayDate}
            displayTime={displayTime}
            practitioner={getRecordPractitioner(record)}
            isFollowUpVisit={isFollowUpVisitRecord}
            parentRecordId={parentRecordId}
            hasLinkedReferral={hasLinkedReferral}
            referralStatus={linkedReferral?.status}
            isUpdating={detailsUpdating}
            onBack={returnToProfile}
            onPrint={() => window.print()}
          />
          <BodyFindingRecordHistory record={record} />
        </div>

        <div className="hidden print:block">
          <BhcHealthRecordPrintDocument
            record={record}
            patient={patient}
            linkedReferral={linkedReferral}
            title={pageTitle}
            recordId={recordId}
            patientName={patientName}
            serviceType={serviceType}
            displayDate={displayDate}
            displayTime={displayTime}
            practitioner={getRecordPractitioner(record)}
            isFollowUpVisit={isFollowUpVisitRecord}
            parentRecordId={parentRecordId}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
