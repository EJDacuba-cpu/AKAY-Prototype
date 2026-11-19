import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";

import BodyFigureSvg from "../BodyFigureSvg";
import LifestyleRow from "./LifestyleRow";
import PatientClinicalControls from "./PatientClinicalControls";
import { HeightRuler, WeightAndBmi } from "./BodyMeasures";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import useRevealSequence from "../../../../hooks/useRevealSequence";
import { buildBodyMeasures } from "../../../../utils/bodyMeasures";
import { groupFindingsByArea, splitFindingsBySide, summarizeBodyFindings } from "../../../../utils/bodyFindingsSummary";
import { formatShortDate } from "../../../../utils/patientProfile";
import { INITIAL_REVEAL, revealFocusReducer } from "../../../../utils/revealFocus";
import { shouldShowBmiDisplay, shouldShowLifestyleControls } from "../../../../utils/infantVisibility";

const DESKTOP_QUERY = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
// Panel width from which the controls curve around the figure; narrower panels
// stack them above and below it instead.
const ARC_MIN_WIDTH = 640;
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function caption(summary, hasRecords) {
  if (!hasRecords) return "No health records yet";
  const count = summary.findings.length;
  if (summary.mode === "ongoing") return count ? `${plural(count, "finding")} awaiting reassessment or last documented as present` : "No ongoing body findings";
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
 * (front or back, switched only by its flip button) with small markers for
 * ongoing findings across accessible finalized visits,
 * on an open canvas. Round clinical controls sit to its left and a height
 * rule to its right; weight, BMI and click-to-open lifestyle details sit
 * below.
 *
 * Hovering or focusing a marker on desktop reveals its area's findings.
 * Clicking or tapping pins the popover, whose finding rows open their record.
 * Escape, a click outside, a second click on the same area, or a flip closes it.
 * Below 1024px there are no hover reveals or lines: a tap shows the popover
 * at once. Reduced motion makes every reveal instant. Documentation only -
 * every marker, highlight and line is something a health worker wrote down;
 * nothing is inferred.
 */
export default function AnatomyFindingsPanel({
  records = [],
  recordsLoading = false,
  recordsError = false,
  background,
  conditions,
  onViewRecord,
  sex,
  birthDate,
  age = "",
  vitals,
}) {
  const [side, setSide] = useState("front");
  const [openFact, setOpenFact] = useState(null);
  const [reveal, dispatch] = useReducer(revealFocusReducer, INITIAL_REVEAL);
  const panelRef = useRef(null);
  const [wideLayout, setArcLayout] = useState(true);
  const hasVitals = Boolean(vitals);
  const arcLayout = !hasVitals && wideLayout;
  const showLifestyle = shouldShowLifestyleControls({ birthDate });
  const showBmi = shouldShowBmiDisplay({ birthDate });
  const popoverId = `overview-figure-popover${useId()}`;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  useEffect(() => {
    const panel = panelRef.current;
    if (hasVitals || !panel || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => setArcLayout(entry.contentRect.width >= ARC_MIN_WIDTH));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [hasVitals]);

  const loadNote =
    recordsLoading && records.length === 0
      ? "Loading body findings..."
      : recordsError && records.length === 0
        ? "Body findings could not be loaded. Please try refreshing the page."
        : "";
  const summary = useMemo(() => summarizeBodyFindings(records, "ongoing"), [records]);
  const findingsBySide = useMemo(() => splitFindingsBySide(summary.findings), [summary]);
  const areas = useMemo(() => groupFindingsByArea(summary.findings), [summary]);
  const measures = useMemo(() => buildBodyMeasures(records, age), [records, age]);
  const findingsByRegion = findingsBySide[side];

  // A focus whose area is gone (records reloaded) counts as no focus.
  const focus = reveal.focus && areas.some((area) => area.key === reveal.focus.key) ? reveal.focus : null;
  const pinned = reveal.pinned && Boolean(focus);
  // Restore focus to the marker that opened the popover when it closes.
  const opener = pinned ? focus.el || null : null;
  const onSideShown = Boolean(focus) && focus.side === side;

  const phase = useRevealSequence(onSideShown ? `${focus.source}:${focus.key}` : null, {
    instant: reducedMotion || pinned || !isDesktop,
  });
  const activeRegion = onSideShown ? focus.region : null;
  const leader = isDesktop && focus?.source === "marker";

  // The pinned area vanished (records refetched, data changed): clear the
  // stale pin, or the reducer would keep ignoring every hover.
  const stalePin = reveal.pinned && !focus;
  useEffect(() => {
    if (stalePin) dispatch({ type: "reset" });
  }, [stalePin]);

  function changeFact(next) {
    setOpenFact(next);
    if (next) dispatch({ type: "reset" });
  }

  function toggleSide() {
    setSide((current) => (current === "front" ? "back" : "front"));
    dispatch({ type: "reset" });
  }

  // Escape hands focus back to the opener, unless focus has already moved to
  // some other control. It is focused before the dismiss, so its focus
  // handler's hover is ignored while still pinned and no preview re-opens.
  // An outside click never moves focus: it goes where the click put it.
  const dismiss = useCallback(
    (reason) => {
      if (reason === "escape" && opener?.isConnected) {
        const active = document.activeElement;
        const focusInPopover = Boolean(active && document.getElementById(popoverId)?.contains(active));
        if (!active || active === document.body || focusInPopover) opener.focus();
      }
      dispatch({ type: "dismiss" });
    },
    [opener, popoverId],
  );

  // A click on the opener of the pinned area unpins it: keep focus on that
  // element (a click alone does not focus a button in every browser).
  // Clicking another marker leaves focus where the click put it.
  function keepFocusOnUnpin(area, el) {
    if (pinned && focus.key === area.key && el && focus.el === el) el.focus();
  }

  // Unpin first (no focus restore), so the figure's Escape / outside-click
  // handlers are gone before the record view opens.
  function viewRecord(recordId) {
    setOpenFact(null);
    dispatch({ type: "dismiss" });
    onViewRecord?.(recordId);
  }

  const markerArea = (region) => ({ key: `${side}:${region}`, region, side });
  function markerEnter(region) {
    if (isDesktop && !openFact) dispatch({ type: "hover", source: "marker", area: markerArea(region) });
  }
  // Leave and blur only ever clear an unpinned hover reveal (the reducer
  // ignores them while pinned).
  function markerLeave(region) {
    dispatch({ type: "leave", source: "marker", key: markerArea(region).key });
  }
  function markerClick(region, el) {
    setOpenFact(null);
    const area = markerArea(region);
    keepFocusOnUnpin(area, el);
    dispatch({ type: "click", source: "marker", area, el, currentSide: side });
  }

  return (
    <section id="overview-visual-summary" aria-labelledby="overview-visual-summary-title" className={`@container/anatomy min-w-0 px-1 py-1 ${vitals ? "patient-anatomy-integrated" : ""}`}>
      <header className={vitals && !loadNote ? "sr-only" : `patient-anatomy-summary-header mb-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center ${arcLayout || hasVitals ? "" : "pr-[6.5rem]"}`}>
        <h2 id="overview-visual-summary-title" className={vitals ? "sr-only" : "font-sans! text-[13px] font-semibold text-neutral-900"}>Visual health summary</h2>
        {loadNote ? (
          <p role="status" className="min-w-0 text-xs text-neutral-500">{loadNote}</p>
        ) : (
          <p role="status" className="sr-only">{caption(summary, records.length > 0)}</p>
        )}
      </header>
      <div className={vitals ? "patient-anatomy-workspace" : "contents"}>
        {vitals && <div className="patient-anatomy-vitals">{vitals}</div>}
        <div ref={panelRef} className="patient-anatomy-layout relative">
          {!arcLayout && !hasVitals && (
            <div className="patient-anatomy-controls-row mb-4">
              <PatientClinicalControls
                background={background}
                conditions={conditions}
                records={records}
                recordsLoading={recordsLoading}
                recordsError={recordsError}
                openFact={openFact}
                onFactChange={changeFact}
                onViewRecord={viewRecord}
                arc={arcLayout}
              />
            </div>
          )}
          <div className="patient-anatomy-stage min-w-0">
            {/* Narrow layouts pad the right to reserve the ruler's lane; the wide one
                centres the figure on the column. Model and findings share
                one proportional frame, so markers stay attached as it scales.
                In the wide layout the clinical and lifestyle controls curve
                around the figure's left inside this same frame. */}
            <div
              style={hasVitals ? undefined : { "--figure-s": "min(100cqh, 150cqw)" }}
              className={`patient-anatomy-frame relative flex min-w-0 items-center justify-center [container-type:size] ${hasVitals ? "" : `h-[420px] @lg/anatomy:h-[520px] ${arcLayout ? "" : "pr-[6.5rem]"}`}`}
            >
              <BodyFigureSvg
                sex={sex}
                birthDate={birthDate}
                side={side}
                onToggleSide={toggleSide}
                flipCorner="left"
                findingsByRegion={findingsByRegion}
                isDesktop={isDesktop}
                popoverId={popoverId}
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
              <HeightRuler
                height={measures.height}
                isLoading={recordsLoading && records.length === 0}
                className="patient-anatomy-ruler absolute top-1/2 h-[min(100cqh,150cqw)] -translate-y-1/2 left-[calc(50cqw+min(100cqh,150cqw)/3+0.75rem)]"
              />
              {arcLayout && (
                <>
                  <PatientClinicalControls
                    background={background}
                    conditions={conditions}
                    records={records}
                    recordsLoading={recordsLoading}
                    recordsError={recordsError}
                    openFact={openFact}
                    onFactChange={changeFact}
                    onViewRecord={viewRecord}
                    arc={arcLayout}
                  />
                  {showLifestyle && <LifestyleRow personalSocial={background?.personalSocial} openFact={openFact} onFactChange={changeFact} arc />}
                </>
              )}
            </div>

          </div>

          {/* Weight and BMI sit right under the feet, centred on the figure. */}
          <div className={`patient-anatomy-measures mt-3 flex flex-col items-center gap-5 ${arcLayout || hasVitals ? "" : "pr-[6.5rem]"}`}>
            {recordsLoading && records.length === 0 ? (
              <p role="status" className="text-xs text-neutral-500">Loading measurements...</p>
            ) : (
              <WeightAndBmi weight={measures.weight} bmi={measures.bmi} showBmi={showBmi} />
            )}
            {!arcLayout && !hasVitals && showLifestyle && <LifestyleRow personalSocial={background?.personalSocial} openFact={openFact} onFactChange={changeFact} />}
          </div>
          {hasVitals && (
            <div className={`patient-anatomy-detail-controls ${showLifestyle ? "patient-anatomy-double-curve" : "patient-anatomy-single-curve"}`}>
              <PatientClinicalControls
                background={background}
                conditions={conditions}
                records={records}
                recordsLoading={recordsLoading}
                recordsError={recordsError}
                openFact={openFact}
                onFactChange={changeFact}
                onViewRecord={viewRecord}
                rail
              />
              {showLifestyle && <LifestyleRow personalSocial={background?.personalSocial} openFact={openFact} onFactChange={changeFact} rail />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
