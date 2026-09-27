import { FieldList, ProfileSection } from "../patients/profile/ProfileSection";
import { formatShortDate } from "../../../utils/patientProfile";

const STATUS_NOTES = {
  Upcoming: "This program has not started yet.",
  Ongoing: "This program is currently running.",
  "Awaiting Completion": "The scheduled run has ended. Awaiting an RHU user to finalize this program.",
  Completed: "This program has been finalized as completed by the RHU.",
  Cancelled: "This program was cancelled by the RHU.",
};

/** Program details: description, schedule, sessions and status context. */
export default function OverviewTab({ program }) {
  return (
    <>
      <ProfileSection id="program-overview" title="Overview">
        {program.description && <p className="mb-4 text-sm text-gray-700">{program.description}</p>}
        <FieldList
          rows={[
            ["Category", program.category],
            ["Publishing RHU", program.publishingRhu],
            ["Schedule", `${formatShortDate(program.runStart)} – ${formatShortDate(program.runEnd)}`],
            ["Participants", String(program.participantCount)],
          ]}
        />
        <p className="mt-4 text-xs text-gray-500">{STATUS_NOTES[program.status]}</p>
      </ProfileSection>

      <ProfileSection id="program-sessions" title="Sessions" meta="Defined by the RHU">
        {program.sessions.length === 0 ? (
          <p className="py-2 text-sm text-gray-500">No sessions scheduled for this program.</p>
        ) : (
          <ol className="divide-y divide-gray-100 border-y border-gray-100">
            {program.sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-gray-700">{session.label}</span>
                <span className="tabular-nums text-gray-500">{formatShortDate(session.date)}</span>
              </li>
            ))}
          </ol>
        )}
      </ProfileSection>
    </>
  );
}
