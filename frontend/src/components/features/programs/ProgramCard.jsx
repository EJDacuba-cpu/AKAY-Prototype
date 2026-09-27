import { Link } from "react-router";
import { ChevronRight, Users } from "lucide-react";

import { formatShortDate } from "../../../utils/patientProfile";
import { getProgramStatusStyle } from "./programStatusStyles";

/**
 * One program's roster card on the BHC Programs page. Purely presentational
 * - `program` is the enriched shape from communityProgramService
 * (status, bhcStaff, participantCount already computed).
 */
export default function ProgramCard({ program }) {
  const staffCount = program.rhuStaff.length + program.bhcStaff.length;

  return (
    <Link
      to={`/bhc/programs/${program.id}`}
      className="group flex h-full flex-col rounded-card border border-[#E5E7EB] bg-white p-4 shadow-card transition hover:border-[#FCA5A5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900 font-sans!">{program.name}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{program.category}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-none border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${getProgramStatusStyle(program.status)}`}
        >
          {program.status}
        </span>
      </div>

      <dl className="mb-3 space-y-1 text-xs text-gray-600">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-400">Schedule</dt>
          <dd className="m-0 tabular-nums text-gray-800">
            {formatShortDate(program.runStart)} – {formatShortDate(program.runEnd)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-400">Publishing RHU</dt>
          <dd className="m-0 truncate text-gray-800">{program.publishingRhu}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-gray-400">Staff assigned</dt>
          <dd className="m-0 text-gray-800">{staffCount}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
          <Users size={12} aria-hidden="true" />
          {program.participantCount} participant{program.participantCount === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600 group-hover:underline">
          View
          <ChevronRight size={12} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
