import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CareTrackingCard from "./CareTrackingCard";
import CommunityProgramsSection from "./CommunityProgramsSection";
import EnrollProgramModal from "./EnrollProgramModal";
import { EmptyNote, ProfileSection } from "./ProfileSection";
import { getCareTracking } from "../../../../utils/careTracking";
import { queryKeys } from "../../../../utils/queryKeys";
import {
  completeEnrollment,
  enrollPatient,
  getPatientEnrollments,
  getPublishedPrograms,
  withdrawEnrollment,
} from "../../../../services/communityProgramService";

/**
 * "Care & Programs" tab body: Care Tracking (derived, read-only, from health
 * records) above Community Programs (explicit RHU-published enrollments,
 * mock data in Phase 1). Kept as two clearly separate sections per plan - a
 * patient is never "in" a community program just because of a clinical
 * record, and Care Tracking is never editable here.
 */
export default function CareAndProgramsTab({
  patient,
  patientId,
  records = [],
  basePath = "/bhc",
  onViewProgramRecords,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const careTracking = useMemo(
    () => getCareTracking(patient || {}, records, new Date()),
    [patient, records],
  );

  const { data: programs = [], isLoading: programsLoading } = useQuery({
    queryKey: queryKeys.communityPrograms(),
    queryFn: getPublishedPrograms,
    staleTime: 60_000,
  });

  const {
    data: enrollments = [],
    isLoading: enrollmentsLoading,
  } = useQuery({
    queryKey: queryKeys.patientCommunityEnrollments(patientId),
    queryFn: () => getPatientEnrollments(patientId),
    enabled: Boolean(patientId),
  });

  function invalidateEnrollments() {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.patientCommunityEnrollments(patientId),
    });
  }

  const patientName =
    patient?.name || patient?.fullName ||
    [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") ||
    "Unknown Patient";

  const enrollMutation = useMutation({
    mutationFn: (payload) => enrollPatient({ ...payload, patientId, patientName }),
    onSuccess: async () => {
      await invalidateEnrollments();
      setEnrollOpen(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (enrollmentId) => completeEnrollment(enrollmentId),
    onSuccess: invalidateEnrollments,
  });

  const withdrawMutation = useMutation({
    mutationFn: ({ enrollmentId, reason }) => withdrawEnrollment(enrollmentId, reason),
    onSuccess: invalidateEnrollments,
  });

  const activeEnrolledProgramIds = enrollments
    .filter((enrollment) => enrollment.status === "Enrolled")
    .map((enrollment) => enrollment.programId);

  function handleCardAction(action) {
    if (action?.type === "start-postpartum-follow-up") {
      // Without a followUpId, mode=followup opens a new step-flow
      // consultation for this patient (utils/consultationRoute.js), with
      // serviceType preselecting the Maternal classification.
      const params = new URLSearchParams({
        patientId: String(patientId || ""),
        mode: "followup",
        serviceType: "Maternal",
        focus: "deliveryDate",
      });
      navigate(`${basePath}/health-records/add?${params.toString()}`);
    }
  }

  return (
    <div>
      <ProfileSection
        id="care-tracking"
        title="Care Tracking"
        meta="Derived from this patient's health records"
      >
        {careTracking.length === 0 ? (
          <EmptyNote>No applicable care programs for this patient yet.</EmptyNote>
        ) : (
          <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
            {careTracking.map((entry) => (
              <CareTrackingCard
                key={entry.key}
                entry={entry}
                onViewRecords={onViewProgramRecords}
                onAction={handleCardAction}
              />
            ))}
          </div>
        )}
      </ProfileSection>

      <CommunityProgramsSection
        enrollments={enrollments}
        isLoading={enrollmentsLoading}
        onEnroll={() => setEnrollOpen(true)}
        onComplete={(enrollmentId) => completeMutation.mutateAsync(enrollmentId)}
        onWithdraw={(enrollmentId, reason) => withdrawMutation.mutateAsync({ enrollmentId, reason })}
      />

      <EnrollProgramModal
        open={enrollOpen}
        programs={programs}
        programsLoading={programsLoading}
        enrolledProgramIds={activeEnrolledProgramIds}
        submitting={enrollMutation.isPending}
        onEnroll={(payload) => enrollMutation.mutateAsync(payload)}
        onClose={() => setEnrollOpen(false)}
      />
    </div>
  );
}
