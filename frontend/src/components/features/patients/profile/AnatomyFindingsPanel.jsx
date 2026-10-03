import { useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import BodyFigureSvg from "../BodyFigureSvg";
import FindingLinkOverlay from "./FindingLinkOverlay";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import PatientFactsSections from "./PatientFactsSections";
import { TextAction } from "./ProfileSection";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import { BODY_REGIONS, BODY_SIDES } from "../../../../utils/bodyFindings";
import { splitFindingsBySide, summarizeBodyFindings } from "../../../../utils/bodyFindingsSummary";
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
 * Centre column of the Overview board: the patient's realistic body figure
 * (front or back, switched only by its flip button) with markers for findings
 * recorded on the latest visit (default) or on every loaded visit, with the
 * Current Conditions / Recorded Findings / Allergies / Medications dropdowns
 * beside it. Each finding is marked only on the side it was recorded on
 * (legacy findings without a side are front). The findings list follows the
 * figure's selected region on the side shown. On desktop, hovering or focusing
 * a Recorded Finding draws a line to its marker (or, for a finding on the
 * other side, pulses the flip button), and hovering a marker highlights its
 * findings in the list. Documentation only - every
 * marker and every line is something a health worker wrote down; nothing is
 * inferred.
 */
export default function AnatomyFindingsPanel({ records = [], recordsLoading = false, background, onViewRecord, sex }) {
  const [mode, setMode] = useState("latest");
  const [side, setSide] = useState("front");
  const [selectedRegion, setSelectedRegion] = useState(null);
  // The Recorded Findings item hovered or focused: { el, item } | null.
  const [activeLink, setActiveLink] = useState(null);
  // The marker region hovered or focused on the figure (side shown).
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const panelRef = useRef(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const summary = useMemo(() => summarizeBodyFindings(records, mode), [records, mode]);
  const findingsBySide = useMemo(() => splitFindingsBySide(summary.findings), [summary]);
  const findingsByRegion = findingsBySide[side];
  // Flat, region-ordered list: the selected region on the side shown, or
  // every finding, front then back.
  const listed = selectedRegion
    ? findingsByRegion[selectedRegion] || []
    : BODY_SIDES.flatMap((key) => BODY_REGIONS.flatMap((region) => findingsBySide[key][region.key] || []));

  // A flip or a mode change can unmount the hovered item or marker without a
  // leave/blur, so both drop the link and the marker hover (the figure resets
  // its own hover on new findings too).
  function clearHover() {
    setActiveLink(null);
    setHoveredRegion(null);
  }

  function changeMode(next) {
    setMode(next);
    selectRegion(null);
    clearHover();
  }

  function selectRegion(region) {
    setSelectedRegion(region);
  }

  function toggleSide() {
    setSide((current) => (current === "front" ? "back" : "front"));
    selectRegion(null);
    clearHover();
  }

  function linkStart(event, item) {
    setActiveLink({ el: event.currentTarget, item });
  }
  function linkEnd(event) {
    const el = event.currentTarget;
    setActiveLink((current) => (current?.el === el ? null : current));
  }

  // Desktop only: a hovered finding on the side shown links to its marker; one
  // on the other side draws no line and hints at the flip button instead
  // (the figure never flips on hover).
  const linkItem = isDesktop ? activeLink?.item : null;
  const linkedRegion = linkItem && linkItem.side === side ? linkItem.region : null;
  const flipHint = Boolean(linkItem && linkItem.side !== side);
  const markerRegion = isDesktop ? hoveredRegion : null;

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
                  onMouseEnter={(event) => linkStart(event, item)}
                  onFocus={(event) => linkStart(event, item)}
                  onMouseLeave={linkEnd}
                  onBlur={linkEnd}
                  disabled={!item.recordId}
                  className={`group flex w-full items-start justify-between gap-2 py-1 text-left text-xs transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40 disabled:cursor-default${
                    markerRegion && item.region === markerRegion && item.side === side ? " bg-red-50" : ""
                  }`}
                >
                  <span className="min-w-0 break-words text-slate-700 group-hover:text-red-700">
                    <span className="font-semibold text-slate-800">{item.regionLabel}</span>
                    {item.side === "back" && (
                      <span className="ml-1 rounded-sm border border-slate-300 px-1 text-[10px] font-semibold uppercase text-slate-500">Back</span>
                    )}
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
      <div ref={panelRef} className="relative flex h-full min-h-0 flex-col gap-3 md:flex-row">
        {linkedRegion && (
          <FindingLinkOverlay containerRef={panelRef} itemEl={activeLink.el} markerRegion={linkedRegion} />
        )}

        <div className="flex h-80 shrink-0 flex-col border-b border-gray-100 pb-2 md:h-auto md:w-2/5 md:max-w-72 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <PatientFactsSections background={background} records={records} recordsLoading={recordsLoading} findings={findings} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] md:pr-0.5">
          <p role="status" className="text-xs tabular-nums text-slate-600">
            {recordsLoading && records.length === 0 ? "Loading body findings..." : caption(summary, records.length > 0)}
          </p>

          {/* A size container, so the figure fits both its height and width. */}
          <div className="flex min-h-[340px] flex-1 items-center justify-center [container-type:size]">
            <BodyFigureSvg
              sex={sex}
              side={side}
              onToggleSide={toggleSide}
              findingsByRegion={findingsByRegion}
              selectedRegion={selectedRegion}
              onSelectRegion={selectRegion}
              isDesktop={isDesktop}
              linkedRegion={linkedRegion}
              flipHint={flipHint}
              onHoverRegion={setHoveredRegion}
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
