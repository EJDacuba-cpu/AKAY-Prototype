import { useCallback, useMemo, useReducer, useRef, useState } from "react";

import BodyFigureSvg from "../BodyFigureSvg";
import FindingLinkOverlay from "./FindingLinkOverlay";
import { OverviewCard, OverviewNote } from "./OverviewCard";
import PatientFactsSections from "./PatientFactsSections";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import useRevealSequence from "../../../../hooks/useRevealSequence";
import { summarizeLatestBmi } from "../../../../utils/bmi";
import { groupFindingsByArea, splitFindingsBySide, summarizeBodyFindings } from "../../../../utils/bodyFindingsSummary";
import { formatShortDate } from "../../../../utils/patientProfile";
import { INITIAL_REVEAL, revealFocusReducer } from "../../../../utils/revealFocus";
import { phaseReached } from "../../../../utils/revealSequence";

const DESKTOP_QUERY = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
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

/** "BMI 27.4 · Overweight · Oct 1, 2026"; no category under 18, no date when missing. */
function bmiLabel(bmi) {
  if (!bmi) return "BMI not recorded";
  return [`BMI ${bmi.value}`, bmi.category, bmi.date ? formatShortDate(bmi.date, "") : ""].filter(Boolean).join(" · ");
}

/**
 * Centre column of the Overview board: the patient's realistic body figure
 * (front or back, switched only by its flip button) with small markers for
 * findings recorded on the latest visit (default) or on every loaded visit,
 * beside the Current Conditions / Findings / Allergies / Medications
 * dropdowns, and the latest BMI under the figure.
 *
 * Findings lists one row per affected area (side + region). Hovering or
 * focusing a row or a marker (desktop) stages a reveal on the figure: a soft
 * area highlight, then a line (row to marker, or marker to popover), then a
 * small popover of that area's findings. A click or tap pins the popover,
 * whose finding rows open their record; Escape, a press outside, a second
 * click on the same area, a flip or a mode change unpins it. A row for the
 * other side only pulses the flip button - the figure never flips by itself.
 * Below 1024px there are no hover reveals or lines: a tap shows the popover
 * at once. Reduced motion makes every reveal instant. Documentation only -
 * every marker, highlight and line is something a health worker wrote down;
 * nothing is inferred.
 */
export default function AnatomyFindingsPanel({
  records = [],
  recordsLoading = false,
  background,
  onViewRecord,
  sex,
  age = "",
}) {
  const [mode, setMode] = useState("latest");
  const [side, setSide] = useState("front");
  const [reveal, dispatch] = useReducer(revealFocusReducer, INITIAL_REVEAL);
  const panelRef = useRef(null);
  // Set by a press on a Findings row while a popover is pinned, so the
  // figure's outside-press dismissal leaves that row's click to toggle or
  // switch the pin.
  const rowPressRef = useRef(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const summary = useMemo(() => summarizeBodyFindings(records, mode), [records, mode]);
  const findingsBySide = useMemo(() => splitFindingsBySide(summary.findings), [summary]);
  const areas = useMemo(() => groupFindingsByArea(summary.findings), [summary]);
  const bmi = useMemo(() => summarizeLatestBmi(records, age), [records, age]);
  const findingsByRegion = findingsBySide[side];

  // A focus whose area is gone (records reloaded) counts as no focus.
  const focus = reveal.focus && areas.some((area) => area.key === reveal.focus.key) ? reveal.focus : null;
  const pinned = reveal.pinned && Boolean(focus);
  const onSideShown = Boolean(focus) && focus.side === side;

  const phase = useRevealSequence(onSideShown ? `${focus.source}:${focus.key}` : null, {
    instant: reducedMotion || pinned || !isDesktop,
  });
  const activeRegion = onSideShown ? focus.region : null;
  const leader = isDesktop && focus?.source === "marker";
  const flipHint = isDesktop && focus?.source === "row" && focus.side !== side;
  const showRowLine = isDesktop && focus?.source === "row" && onSideShown && phaseReached(phase, "line");

  function changeMode(next) {
    setMode(next);
    dispatch({ type: "reset" });
  }

  function toggleSide() {
    setSide((current) => (current === "front" ? "back" : "front"));
    dispatch({ type: "reset" });
  }

  const dismiss = useCallback(() => {
    if (rowPressRef.current) {
      rowPressRef.current = false;
      return;
    }
    dispatch({ type: "dismiss" });
  }, []);

  // Unpin first, so the figure's Escape / outside-press handlers are gone
  // before the record view opens.
  function viewRecord(recordId) {
    dispatch({ type: "dismiss" });
    onViewRecord?.(recordId);
  }

  const markerArea = (region) => ({ key: `${side}:${region}`, region, side });
  function markerEnter(region) {
    if (isDesktop) dispatch({ type: "hover", source: "marker", area: markerArea(region) });
  }
  // Leave and blur only ever clear an unpinned hover reveal (the reducer
  // ignores them while pinned).
  function markerLeave(region) {
    dispatch({ type: "leave", source: "marker", key: markerArea(region).key });
  }
  function markerClick(region) {
    dispatch({ type: "click", source: "marker", area: markerArea(region), currentSide: side });
  }

  function rowEnter(event, area) {
    if (isDesktop) dispatch({ type: "hover", source: "row", area, el: event.currentTarget });
  }
  function rowLeave(event, area) {
    dispatch({ type: "leave", source: "row", key: area.key, el: event.currentTarget });
  }
  function rowClick(event, area) {
    rowPressRef.current = false;
    dispatch({ type: "click", source: "row", area, el: event.currentTarget, currentSide: side });
  }

  const findings = {
    title: "Findings",
    count: areas.length,
    content:
      areas.length === 0 ? (
        <OverviewNote>No body findings recorded.</OverviewNote>
      ) : (
        <ul className="divide-y divide-gray-100">
          {areas.map((area) => {
            const active = focus?.key === area.key;
            return (
              <li key={area.key}>
                <button
                  type="button"
                  aria-expanded={pinned && active}
                  aria-label={`${area.label}, ${plural(area.count, "finding")}${area.side === "back" ? ", back" : ""}`}
                  onPointerDown={() => {
                    if (!pinned) return;
                    rowPressRef.current = true;
                    // The figure's document listener consumes it during this
                    // same event; never let it outlive the event.
                    setTimeout(() => {
                      rowPressRef.current = false;
                    }, 0);
                  }}
                  onClick={(event) => rowClick(event, area)}
                  onMouseEnter={(event) => rowEnter(event, area)}
                  onFocus={(event) => rowEnter(event, area)}
                  onMouseLeave={(event) => rowLeave(event, area)}
                  onBlur={(event) => rowLeave(event, area)}
                  className={`group flex w-full items-center justify-between gap-2 py-1 text-left text-xs transition-colors hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600/40${
                    active ? " bg-red-50" : ""
                  }`}
                >
                  <span className="min-w-0 break-words font-semibold text-slate-800 group-hover:text-red-700">
                    {area.label}
                    {area.side === "back" && (
                      <span className="ml-1 rounded-sm border border-slate-300 px-1 text-[10px] font-semibold uppercase text-slate-500">
                        Back
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">{area.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
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
        {showRowLine && <FindingLinkOverlay containerRef={panelRef} itemEl={focus.el} markerRegion={focus.region} />}

        <div className="flex h-80 shrink-0 flex-col border-b border-gray-100 pb-2 md:h-auto md:w-2/5 md:max-w-72 md:border-b-0 md:border-r md:pb-0 md:pr-3">
          <PatientFactsSections background={background} records={records} recordsLoading={recordsLoading} findings={findings} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin] md:pr-0.5">
          <p role="status" className="text-xs tabular-nums text-slate-600">
            {recordsLoading && records.length === 0 ? "Loading body findings..." : caption(summary, records.length > 0)}
          </p>

          {/* A size container, so the figure fits both its height and width;
              the figure places its popover within it. */}
          <div className="flex min-h-[340px] flex-1 items-center justify-center [container-type:size]">
            <BodyFigureSvg
              sex={sex}
              side={side}
              onToggleSide={toggleSide}
              flipHint={flipHint}
              findingsByRegion={findingsByRegion}
              isDesktop={isDesktop}
              activeRegion={activeRegion}
              phase={phase}
              pinned={pinned}
              leader={leader}
              onMarkerEnter={markerEnter}
              onMarkerLeave={markerLeave}
              onMarkerClick={markerClick}
              onViewRecord={viewRecord}
              onDismiss={dismiss}
            />
          </div>

          <p className="mt-2 text-center text-xs tabular-nums text-slate-500">{bmiLabel(bmi)}</p>
        </div>
      </div>
    </OverviewCard>
  );
}
