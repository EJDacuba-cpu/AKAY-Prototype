import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import BodyFigureSvg from "../BodyFigureSvg";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import { TextAction } from "./ProfileSection";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import { BODY_REGIONS } from "../../../../utils/bodyFindings";
import { summarizeBodyFindings } from "../../../../utils/bodyFindingsSummary";
import { formatShortDate } from "../../../../utils/patientProfile";

const DESKTOP_QUERY = "(min-width: 1024px)";
const FINDINGS_PREVIEW = 4;
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
 * visit, plus the matching findings list. Documentation only - every marker
 * is a finding a health worker wrote down; nothing is inferred.
 */
export default function AnatomyFindingsPanel({ records = [], recordsLoading = false, onViewRecord }) {
  const [mode, setMode] = useState("latest");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const summary = useMemo(() => summarizeBodyFindings(records, mode), [records, mode]);
  const findingsByRegion = useMemo(() => {
    const grouped = {};
    for (const item of summary.findings) (grouped[item.region] ||= []).push(item);
    return grouped;
  }, [summary]);
  // Flat, region-ordered list (filtered to the selected region), capped
  // to FINDINGS_PREVIEW rows until "Show all".
  const listed = BODY_REGIONS.flatMap(({ key }) =>
    !selectedRegion || selectedRegion === key ? findingsByRegion[key] || [] : [],
  );
  const visible = showAll ? listed : listed.slice(0, FINDINGS_PREVIEW);

  function changeMode(next) {
    setMode(next);
    selectRegion(null);
  }

  function selectRegion(region) {
    setSelectedRegion(region);
    setShowAll(false);
  }

  return (
    <OverviewCard
      id="overview-visual-summary"
      title="Visual Health Summary"
      spacious
      action={<ModeToggle mode={mode} onChange={changeMode} />}
    >
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

      {listed.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 font-sans!">
              {selectedRegion ? listed[0].regionLabel : "Recorded findings"}
            </h3>
            {selectedRegion && <TextAction onClick={() => selectRegion(null)}>Clear selection</TextAction>}
          </div>
          <ul className="divide-y divide-gray-100">
            {visible.map((item) => (
              <li key={`${item.recordId}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => onViewRecord(item.recordId)}
                  disabled={!item.recordId}
                  className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1 text-left text-xs transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40 disabled:cursor-default"
                >
                  <span className="min-w-0 truncate text-slate-700 group-hover:text-red-700">
                    <span className="font-semibold text-slate-800">{item.regionLabel}</span>
                    {" – "}
                    {item.location ? `${item.location}: ` : ""}
                    <span className="font-medium text-slate-900 group-hover:text-red-700">{item.finding}</span>
                    {item.note ? <span className="text-slate-500"> ({item.note})</span> : null}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] tabular-nums text-slate-500">
                    {formatShortDate(item.visitDate, "Date not recorded")}
                    <ChevronRight size={12} className="text-slate-300 group-hover:text-red-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {listed.length > FINDINGS_PREVIEW && (
            <div className="pt-1">
              <TextAction onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Show less" : `Show all ${listed.length}`}
              </TextAction>
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        <OverviewNote>Shows body findings as recorded during visits.</OverviewNote>
      </div>
    </OverviewCard>
  );
}
