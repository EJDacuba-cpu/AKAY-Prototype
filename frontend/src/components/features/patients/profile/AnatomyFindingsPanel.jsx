import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import BodyFigureSvg from "../BodyFigureSvg";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import PatientFactsSections from "./PatientFactsSections";
import { TextAction } from "./ProfileSection";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import { BODY_REGIONS } from "../../../../utils/bodyFindings";
import { summarizeBodyFindings } from "../../../../utils/bodyFindingsSummary";
import { formatShortDate } from "../../../../utils/patientProfile";

const DESKTOP_QUERY = "(min-width: 1024px)";
const MODES = [
  { key: "latest", label: "Latest visit" },
  { key: "history", label: "View history" },
];

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function ModeToggle({ mode, onChange }) {
  return (
    <div role="group" aria-label="Findings shown" className="inline-flex border border-slate-300 bg-white/60 p-0.5">
      {MODES.map(({ key, label }) => {
        const active = key === mode;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 ${
              active ? "bg-red-600 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function caption(summary, hasRecords) {
  if (!hasRecords) return "No health records yet";
  const count = summary.findings.length;
  if (summary.mode === "history") {
    return count === 0
      ? "No body findings recorded on any visit"
      : `All visits · ${plural(count, "finding")} across ${plural(summary.visitCount, "visit")}`;
  }
  const date = summary.visitDate ? formatShortDate(summary.visitDate) : "";
  if (count === 0) return date ? `No body findings on latest visit (${date})` : "No body findings on latest visit";
  return `Latest visit · ${date} · ${plural(count, "finding")}`;
}

/**
 * Centre column of the Overview board: the shared body figure with markers
 * for findings recorded on the latest visit (default) or on every loaded
 * visit, with the Current Conditions / Recorded Findings / Allergies /
 * Medications dropdowns beside it. The findings list follows the figure's
 * selected region. Documentation only - every marker and every line is
 * something a health worker wrote down; nothing is inferred.
 */
export default function AnatomyFindingsPanel({ records = [], recordsLoading = false, background, onViewRecord }) {
  const [mode, setMode] = useState("latest");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const summary = useMemo(() => summarizeBodyFindings(records, mode), [records, mode]);
  const findingsByRegion = useMemo(() => {
    const grouped = {};
    for (const item of summary.findings) (grouped[item.region] ||= []).push(item);
    return grouped;
  }, [summary]);
  // Flat, region-ordered list, filtered to the selected region.
  const listed = BODY_REGIONS.flatMap(({ key }) =>
    !selectedRegion || selectedRegion === key ? findingsByRegion[key] || [] : [],
  );

  function changeMode(next) {
    setMode(next);
    selectRegion(null);
  }

  function selectRegion(region) {
    setSelectedRegion(region);
  }

  const findings = {
    title: selectedRegion && listed[0] ? listed[0].regionLabel : "Recorded Findings",
    count: listed.length,
    content: (
      <>
        {selectedRegion && (
          <div className="mb-1">
            <TextAction onClick={() => selectRegion(null)}>Clear selection</TextAction>
          </div>
        )}
        {listed.length === 0 ? (
          <OverviewNote>No body findings recorded.</OverviewNote>
        ) : (
          <ul className="divide-y divide-gray-100">
            {listed.map((item) => (
              <li key={`${item.recordId}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => onViewRecord(item.recordId)}
                  disabled={!item.recordId}
                  className="group flex w-full items-start justify-between gap-2 py-1 text-left text-xs transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40 disabled:cursor-default"
                >
                  <span className="min-w-0 break-words text-slate-700 group-hover:text-red-700">
                    <span className="font-semibold text-slate-800">{item.regionLabel}</span>
                    {" – "}
                    {item.location ? `${item.location}: ` : ""}
                    <span className="font-medium text-slate-900 group-hover:text-red-700">{item.finding}</span>
                    {item.note ? <span className="text-slate-500"> ({item.note})</span> : null}
                    <span className="mt-0.5 block text-[11px] tabular-nums text-slate-500">
                      {formatShortDate(item.visitDate, "Date not recorded")}
                    </span>
                  </span>
                  <ChevronRight size={12} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-red-600" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    ),
  };

  return (
    <OverviewCard
      id="overview-visual-summary"
      title="Visual Health Summary"
      spacious
      minHeight={480}
      action={<ModeToggle mode={mode} onChange={changeMode} />}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
        <div className="flex h-80 shrink-0 flex-col border-b border-gray-100 pb-2 md:h-auto md:w-2/5 md:max-w-72 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <PatientFactsSections background={background} records={records} recordsLoading={recordsLoading} findings={findings} />
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-width:thin] md:pr-0.5">
          <p role="status" className="text-xs tabular-nums text-slate-600">
            {recordsLoading && records.length === 0 ? "Loading body findings..." : caption(summary, records.length > 0)}
          </p>

          <div className="flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(241,245,249,1)_0%,rgba(241,245,249,0)_70%)] py-3">
            <BodyFigureSvg
              findingsByRegion={findingsByRegion}
              selectedRegion={selectedRegion}
              onSelectRegion={selectRegion}
              isDesktop={isDesktop}
            />
          </div>

          <div className="mt-2">
            <OverviewNote>Shows body findings as recorded during visits.</OverviewNote>
          </div>
        </div>
      </div>
    </OverviewCard>
  );
}
