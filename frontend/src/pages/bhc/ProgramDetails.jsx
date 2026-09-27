import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import DashboardLayout from "../../components/layout/DashboardLayout";
import { ConnectionErrorState, SoftLoadingArea } from "../../components/common";
import OverviewTab from "../../components/features/programs/OverviewTab";
import ParticipantsTab from "../../components/features/programs/ParticipantsTab";
import StaffTab from "../../components/features/programs/StaffTab";
import { getProgramStatusStyle } from "../../components/features/programs/programStatusStyles";
import {
  addBhcStaffAssignment,
  completeEnrollment,
  enrollPatient,
  getProgramDetail,
  getProgramParticipants,
  recordAttendance,
  removeBhcStaffAssignment,
  withdrawEnrollment,
} from "../../services/communityProgramService";
import { isConnectionError } from "../../services/apiClient";
import { queryKeys } from "../../utils/queryKeys";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "participants", label: "Participants" },
  { key: "staff", label: "Staff" },
];

function DetailTabs({ activeTab, onSelect, participantCount }) {
  return (
    <div
      role="tablist"
      aria-label="Program detail"
      className="mb-4 overflow-x-auto rounded-card border border-[#E5E7EB] bg-white shadow-card"
    >
      <nav className="flex">
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          const count = tab.key === "participants" ? ` (${participantCount})` : "";
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(tab.key)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-colors duration-150 ${
                active
                  ? "border-[#B91C1C] text-[#B91C1C]"
                  : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-600"
              }`}
            >
              {tab.label}
              {count}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * A single Community Program's detail: Overview / Participants / Staff.
 * Routine clinical care never happens here - "Start Consultation" on a
 * participant just links into the normal consultation workflow.
 */
export default function ProgramDetails() {
  const { programId } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const {
    data: program,
    isLoading: programLoading,
    error: programError,
    refetch: refetchProgram,
  } = useQuery({
    queryKey: queryKeys.communityProgramDetails(programId),
    queryFn: () => getProgramDetail(programId),
    enabled: Boolean(programId),
    retry: false,
  });

  const {
    data: participants = [],
    isLoading: participantsLoading,
  } = useQuery({
    queryKey: queryKeys.communityProgramParticipants(programId),
    queryFn: () => getProgramParticipants(programId),
    enabled: Boolean(programId),
  });

  function invalidateAll() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.communityProgramDetails(programId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.communityProgramParticipants(programId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.communityPrograms() }),
    ]);
  }

  const enrollMutation = useMutation({
    mutationFn: (payload) => enrollPatient({ ...payload, programId }),
    onSuccess: invalidateAll,
  });
  const completeMutation = useMutation({
    mutationFn: (enrollmentId) => completeEnrollment(enrollmentId),
    onSuccess: invalidateAll,
  });
  const withdrawMutation = useMutation({
    mutationFn: ({ enrollmentId, reason }) => withdrawEnrollment(enrollmentId, reason),
    onSuccess: invalidateAll,
  });
  const attendanceMutation = useMutation({
    mutationFn: ({ enrollmentId, sessionId, mark }) => recordAttendance(enrollmentId, sessionId, mark),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.communityProgramParticipants(programId) }),
  });
  const addStaffMutation = useMutation({
    mutationFn: (payload) => addBhcStaffAssignment(programId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.communityProgramDetails(programId) }),
  });
  const removeStaffMutation = useMutation({
    mutationFn: (assignmentId) => removeBhcStaffAssignment(programId, assignmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.communityProgramDetails(programId) }),
  });

  if (programLoading) {
    return (
      <DashboardLayout role="bhc" title="Program Details">
        <SoftLoadingArea isLoading message="Loading program..." minHeight="min-h-[400px]">
          <div className="min-h-[400px]" />
        </SoftLoadingArea>
      </DashboardLayout>
    );
  }

  if (programError || !program) {
    return (
      <DashboardLayout role="bhc" title="Program Details">
        <ConnectionErrorState
          fullPage
          onRetry={refetchProgram}
          variant={isConnectionError(programError) ? "offline" : "error"}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title={program.name}>
      <div className="px-4 py-4 pb-8 font-sans sm:px-6 [&_h1]:font-sans! [&_h2]:font-sans! [&_h3]:font-sans!">
        <Link
          to="/bhc/programs"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={12} aria-hidden="true" />
          Back to Programs
        </Link>

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{program.name}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {program.category} · {program.publishingRhu}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-none border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${getProgramStatusStyle(program.status)}`}
          >
            {program.status}
          </span>
        </div>

        <DetailTabs activeTab={activeTab} onSelect={setActiveTab} participantCount={participants.length} />

        {activeTab === "overview" && <OverviewTab program={program} />}

        {activeTab === "participants" && (
          <ParticipantsTab
            program={program}
            participants={participants}
            isLoading={participantsLoading}
            markingAttendance={attendanceMutation.isPending}
            onAddParticipant={(payload) => enrollMutation.mutateAsync(payload)}
            onComplete={(enrollmentId) => completeMutation.mutateAsync(enrollmentId)}
            onWithdraw={(enrollmentId, reason) => withdrawMutation.mutateAsync({ enrollmentId, reason })}
            onMarkAttendance={(enrollmentId, sessionId, mark) =>
              attendanceMutation.mutateAsync({ enrollmentId, sessionId, mark })
            }
          />
        )}

        {activeTab === "staff" && (
          <StaffTab
            program={program}
            mutating={addStaffMutation.isPending || removeStaffMutation.isPending}
            onAddStaff={(payload) => addStaffMutation.mutateAsync(payload)}
            onRemoveStaff={(assignmentId) => removeStaffMutation.mutateAsync(assignmentId)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
