import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import AnatomyFigure from "../../patients/AnatomyFigure";
import {
  BODY_FINDING_LIMITS,
  BODY_REGIONS,
  BODY_SIDES,
  OTHER_LOCATION,
  createBodyFindingId,
  getBodyRegionLabel,
  getSpecificLocationOptions,
  resolveSpecificLocation,
  splitSpecificLocation,
} from "../../../../utils/bodyFindings";
import { getDotPosition, getFigureKey, markerStyle } from "../../../../utils/bodyFigureGeometry";

/**
 * 2D body preview for the Physical Exam & Assessment step: sits in the fixed
 * right-hand column where Barangay Health Services sits on the Interview step.
 *
 * Optional. It documents WHERE on the body a finding was noted for this visit
 * - it never suggests symptoms, diagnoses or interpretations. A realistic
 * male or female figure (front or back, switched only by its flip button)
 * carries one small dot per body area; clicking (or tapping, or Enter/Space
 * on) a dot opens the finding input for that area on the side shown:
 * anchored beside the dot from 1024px, a bottom sheet below that. On desktop,
 * hovering or focusing a dot previews its findings in a small callout - it
 * never replaces opening the dialog to add or edit one. Added findings are
 * listed by body area under Physical Examination (BodyFindingsList).
 *
 * Front view: the PATIENT's right side is on the viewer's left. Back view:
 * the patient's right is on the viewer's right. The R / L markers say so.
 */

const DESKTOP_QUERY = "(min-width: 1024px)";
const DIALOG_WIDTH = 288;
const GAP = 12;
const EDGE = 8;
// Hover callout width; it is clamped inside the figure box by this width.
const CALLOUT_WIDTH = 168;

/**
 * One body-area dot: neutral by default, AKAY red once it has a finding on
 * the side shown. An HTML button at the region's normalized position; its
 * sizes are fixed CSS pixels, so the 28px hit area holds as the figure scales.
 */
function BodyDot({ region, label, position, count, active, hovered, readOnly, onOpen, onHoverStart, onHoverEnd }) {
  const hasFindings = count > 0;
  const highlighted = active || hovered;
  const dotTone = hasFindings ? "border-white bg-[#DC2626]" : "border-[#9CA3AF] bg-white";
  const fullLabel = `${label}${hasFindings ? `, ${count} finding${count === 1 ? "" : "s"}` : ""}`;

  return (
    <button
      type="button"
      data-region={region}
      role={readOnly ? "img" : undefined}
      tabIndex={readOnly ? -1 : 0}
      aria-label={readOnly ? fullLabel : `${fullLabel}. Add a finding`}
      // A native button turns Enter and Space into this click.
      onClick={readOnly ? undefined : (event) => onOpen(region, event.currentTarget)}
      onMouseEnter={() => onHoverStart(region)}
      onMouseLeave={() => onHoverEnd(region)}
      onFocus={() => onHoverStart(region)}
      onBlur={() => onHoverEnd(region)}
      style={markerStyle(position)}
      // The transparent 28px button is the hit area - the visible dot stays small and clean.
      className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600/40 ${
        readOnly ? "cursor-default" : "cursor-pointer"
      }`}
    >
      {highlighted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#DC2626]"
        />
      )}
      <span
        aria-hidden="true"
        className={`pointer-events-none block h-3 w-3 rounded-full border-[1.5px] transition-colors duration-150 ${dotTone}`}
      />
      {count >= 2 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[calc(50%+7px)] top-[calc(50%-7px)] flex h-[13px] min-w-[13px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-white bg-[#DC2626] px-px text-[8px] font-bold leading-none text-white"
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * The figure plus, on desktop only, a hover/focus preview: a callout card
 * for a dot with findings, or a plain label for one without. It sits below
 * the dot (above it on the lower body), centred on the dot but clamped inside
 * the figure box so it never runs past the narrow side column. Decorative only - the dot's own aria-label already carries this
 * information, so the preview is hidden from assistive tech. Clicking still
 * goes through onOpen regardless of hover state. Counts and previews cover
 * only the side shown.
 */
function BodyFigure({ findings, sex, side, onToggleSide, countByRegion, activeRegion, readOnly, isDesktop, onOpen }) {
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const figure = getFigureKey(sex);

  function hoverStart(region) {
    if (!isDesktop || activeRegion) return;
    setHoveredRegion(region);
  }
  function hoverEnd(region) {
    setHoveredRegion((current) => (current === region ? null : current));
  }

  const overlayRegion = activeRegion ? null : hoveredRegion;
  const overlayCount = overlayRegion ? countByRegion[overlayRegion] || 0 : 0;
  const overlayFinding = overlayRegion
    ? findings.find((item) => item.region === overlayRegion && item.side === side)
    : null;
  const [overlayX, overlayY] = overlayRegion ? getDotPosition(figure, side, overlayRegion) : [0, 0];
  const overlayStyle = overlayRegion
    ? {
        ...(overlayY > 0.7
          ? { bottom: `calc(${(1 - overlayY) * 100}% + 16px)` }
          : { top: `calc(${overlayY * 100}% + 16px)` }),
        left: `clamp(0px, calc(${overlayX * 100}% - ${CALLOUT_WIDTH / 2}px), calc(100% - ${CALLOUT_WIDTH}px))`,
        width: `${CALLOUT_WIDTH}px`,
      }
    : null;

  return (
    <AnatomyFigure
      sex={sex}
      side={side}
      onToggleSide={onToggleSide}
      label={side === "front" ? "Front-facing body figure" : "Back-facing body figure"}
      className="mx-auto w-full max-w-[240px]"
    >
      {BODY_REGIONS.map((region) => (
        <BodyDot
          key={region.key}
          region={region.key}
          label={getBodyRegionLabel(region.key, side)}
          position={getDotPosition(figure, side, region.key)}
          count={countByRegion[region.key] || 0}
          active={activeRegion === region.key}
          hovered={hoveredRegion === region.key}
          readOnly={readOnly}
          onOpen={onOpen}
          onHoverStart={hoverStart}
          onHoverEnd={hoverEnd}
        />
      ))}

      {overlayRegion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 flex justify-center"
          style={overlayStyle}
        >
          <div
            className={`${overlayCount > 0 ? "bp-callout-card w-full px-2.5 py-2" : "bp-tooltip max-w-full truncate whitespace-nowrap px-2 py-1"} border border-[#111827] bg-[#111827] text-[11px] leading-snug text-white shadow-lg`}
          >
            <p className="font-semibold">{getBodyRegionLabel(overlayRegion, side)}</p>
            {overlayCount > 0 && (
              <>
                <p className="text-[#D1D5DB]">{overlayCount} finding{overlayCount === 1 ? "" : "s"}</p>
                {overlayFinding && (
                  <p className="mt-0.5 truncate text-[#F3F4F6]">
                    {overlayFinding.location ? `${overlayFinding.location}: ` : ""}{overlayFinding.finding}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </AnatomyFigure>
  );
}

/**
 * The input for one region on one side: its findings (each editable and
 * removable) and a single free-text Finding field with an optional note.
 * Nothing is suggested or inferred - the user writes the finding. A native
 * modal <dialog> (focus trap, Esc, backdrop), placed beside the dot from
 * 1024px and as a bottom sheet below that.
 *
 * Below 1024px, a region that already has findings opens straight to that
 * summary - the add/edit form only appears once "Add finding" is tapped, or
 * immediately when editing a specific entry. A region with no findings yet
 * opens straight to the form, so there's no empty summary to tap through.
 */
function FindingDialog({ region, side, anchor, findings, initialEditingId, readOnly, onSave, onRemove, onClose }) {
  const dialogRef = useRef(null);
  const findingInputRef = useRef(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const initial = findings.find((item) => item.id === initialEditingId) || null;
  const [editingId, setEditingId] = useState(initial?.id || null);
  const [finding, setFinding] = useState(initial?.finding || "");
  const [note, setNote] = useState(initial?.note || "");
  const initialLocation = splitSpecificLocation(region, initial?.location, side);
  const [locationChoice, setLocationChoice] = useState(initialLocation.choice);
  const [otherLocation, setOtherLocation] = useState(initialLocation.other);
  const [formOpen, setFormOpen] = useState(() => Boolean(initial) || findings.length === 0);
  const otherLocationRef = useRef(null);
  const locationOptions = getSpecificLocationOptions(region, side);
  const titleId = `body-finding-title-${side}-${region}`;
  const showForm = isDesktop || formOpen;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable (the close button); start on
      // the Finding field when it's visible so typing can begin at once.
      findingInputRef.current?.focus();
    }

    const place = () => {
      const desktop = window.matchMedia(DESKTOP_QUERY).matches;
      // Opened from the findings list there is no anchor: by now the figure
      // has re-rendered on the finding's side, so its dot is the anchor.
      const target = anchor?.isConnected ? anchor : getBodyRegionAnchor(region);
      if (!desktop || !target) {
        Object.assign(dialog.style, { position: "fixed", left: "0", right: "0", top: "auto", bottom: "0" });
        return;
      }
      const rect = target.getBoundingClientRect();
      const height = dialog.offsetHeight;
      let left = rect.left - DIALOG_WIDTH - GAP;
      if (left < EDGE) left = Math.min(rect.right + GAP, window.innerWidth - DIALOG_WIDTH - EDGE);
      const top = Math.min(
        Math.max(rect.top + rect.height / 2 - height / 2, EDGE),
        window.innerHeight - height - EDGE,
      );
      Object.assign(dialog.style, {
        position: "fixed",
        left: `${Math.max(left, EDGE)}px`,
        top: `${Math.max(top, EDGE)}px`,
        right: "auto",
        bottom: "auto",
      });
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(dialog);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor, region]);

  // Focus the Finding field whenever the form appears - on open when it
  // starts visible, or when "Add finding" reveals it on mobile.
  useEffect(() => {
    if (showForm) findingInputRef.current?.focus();
  }, [showForm]);

  function resetForm() {
    setEditingId(null);
    setFinding("");
    setNote("");
    setLocationChoice("");
    setOtherLocation("");
  }

  function save() {
    const text = finding.trim();
    if (!text) {
      findingInputRef.current?.focus();
      return;
    }
    onSave({
      id: editingId || createBodyFindingId(),
      region,
      side,
      location: resolveSpecificLocation(locationChoice, otherLocation),
      finding: text,
      note: note.trim(),
    });
    resetForm();
    findingInputRef.current?.focus();
  }

  function startEdit(item) {
    const split = splitSpecificLocation(region, item.location, side);
    setEditingId(item.id);
    setFinding(item.finding);
    setNote(item.note || "");
    setLocationChoice(split.choice);
    setOtherLocation(split.other);
    setFormOpen(true);
    findingInputRef.current?.focus();
  }

  function changeLocation(value) {
    setLocationChoice(value);
    if (value === OTHER_LOCATION) {
      // Wait for the Other field to render before focusing it.
      requestAnimationFrame(() => otherLocationRef.current?.focus());
    } else {
      setOtherLocation("");
    }
  }

  function submitOnEnter(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  }

  const inputClass =
    "h-9 w-full rounded-none border border-[#D1D5DB] bg-white px-3 text-sm text-[#111827] outline-none transition-colors duration-150 placeholder:text-[#9CA3AF] focus:border-[#DC2626] focus:ring-2 focus:ring-red-200";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      // Light dismiss: a click landing on the dialog element itself (not its
      // content) is a click on the backdrop. `closedby="any"` is not yet
      // supported widely enough to rely on.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-none border border-[#E5E7EB] bg-white p-0 text-[#111827] shadow-lg backdrop:bg-black/30 lg:w-[288px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Body area</p>
          <h2 id={titleId} className="text-[14px] font-bold leading-snug">{getBodyRegionLabel(region, side)}</h2>
          {findings.length > 0 && (
            <p className="mt-0.5 text-[11px] text-[#6B7280]">{findings.length} finding{findings.length === 1 ? "" : "s"}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
          className="flex h-8 w-8 flex-none items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {findings.length > 0 && (
        <ul className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
          {findings.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-1 border-l-4 py-2 pl-3 pr-2 ${
                item.id === editingId ? "border-l-[#DC2626] bg-red-50" : "border-l-transparent"
              }`}
            >
              <div className="min-w-0 flex-1">
                {item.location && (
                  <p className="break-words text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                    {item.location}
                  </p>
                )}
                <p className="break-words text-[13px] font-semibold leading-snug">{item.finding}</p>
                {item.note && <p className="mt-0.5 break-words text-xs text-[#6B7280]">{item.note}</p>}
              </div>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    aria-label={`Edit ${item.finding}`}
                    className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.id === editingId) resetForm();
                      onRemove(item.id);
                    }}
                    aria-label={`Remove ${item.finding}`}
                    className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-red-50 hover:text-[#DC2626]"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && !showForm && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex h-9 w-full items-center justify-center gap-1.5 border border-[#DC2626] text-sm font-semibold text-[#DC2626] hover:bg-red-50"
          >
            <Plus size={14} aria-hidden="true" />
            Add finding
          </button>
        </div>
      )}

      {!readOnly && showForm && (
        <div className="space-y-3 px-4 py-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
              Specific location <span className="font-normal normal-case tracking-normal text-[#6B7280]">(optional)</span>
            </span>
            <select
              value={locationChoice}
              onChange={(event) => changeLocation(event.target.value)}
              className={inputClass}
            >
              <option value="">Select location</option>
              {locationOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {locationChoice === OTHER_LOCATION && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
                Specify location
              </span>
              <input
                ref={otherLocationRef}
                value={otherLocation}
                maxLength={BODY_FINDING_LIMITS.location}
                onChange={(event) => setOtherLocation(event.target.value)}
                onKeyDown={submitOnEnter}
                className={inputClass}
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
              Finding <span className="text-red-500">*</span>
            </span>
            <input
              ref={findingInputRef}
              value={finding}
              maxLength={BODY_FINDING_LIMITS.finding}
              onChange={(event) => setFinding(event.target.value)}
              onKeyDown={submitOnEnter}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
              Note <span className="font-normal normal-case tracking-normal text-[#6B7280]">(optional)</span>
            </span>
            <input
              value={note}
              maxLength={BODY_FINDING_LIMITS.note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={submitOnEnter}
              className={inputClass}
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={editingId ? resetForm : () => dialogRef.current?.close()}
              className="h-9 px-3 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]"
            >
              {editingId ? "Cancel edit" : "Done"}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!finding.trim()}
              className="h-9 bg-[#DC2626] px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editingId ? "Save changes" : "Add finding"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** The figure's dot element for a region on the side shown, used to anchor the dialog beside it. */
export function getBodyRegionAnchor(region) {
  if (typeof document === "undefined") return null;
  return document.querySelector(`[data-body-preview] [data-region="${region}"]`);
}

/**
 * @param findings       [{ id, region, side, location, finding, note }]
 * @param onChange       receives the next findings list
 * @param readOnly       view only (locked review / patient gate); flipping stays allowed
 * @param dialog         { region, side, anchor, editingId } while the input is open, else
 *                       null; anchor may be null (the dot is then looked up)
 * @param onDialogChange opens (object) or closes (null) the input; owned by the
 *                       page so the Physical Examination list can open it too
 * @param sex            the patient's sex; picks the male or female figure
 * @param side           "front" | "back" - the figure side shown, owned by the page
 * @param onSideChange   receives the next side when the flip button is used
 */
export default function BodyPreviewPanel({
  findings = [],
  onChange,
  readOnly = false,
  dialog,
  onDialogChange,
  sex,
  side = "front",
  onSideChange,
}) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const countByRegion = findings.reduce((counts, item) => {
    if (item.side === side) counts[item.region] = (counts[item.region] || 0) + 1;
    return counts;
  }, {});

  function handleClose() {
    const anchor = dialog?.anchor;
    onDialogChange(null);
    // Return focus to the region that opened the dialog.
    if (anchor?.isConnected) anchor.focus({ preventScroll: true });
  }

  function saveFinding(item) {
    if (findings.some((entry) => entry.id === item.id)) {
      onChange(findings.map((entry) => (entry.id === item.id ? item : entry)));
    } else if (findings.length < BODY_FINDING_LIMITS.count) {
      onChange([...findings, item]);
    }
  }

  // The flip is hidden while the input is open, so the side can't change
  // under it.
  const toggleSide = onSideChange ? () => onSideChange(side === "front" ? "back" : "front") : undefined;

  return (
    <aside
      aria-label="Body Preview"
      data-body-preview
      className="min-w-0 rounded-none border border-[#E5E7EB] bg-white lg:sticky lg:top-3 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[#E5E7EB] px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold leading-snug text-[#111827]">Body Preview</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B7280]">
            {readOnly
              ? "Where findings were noted for this visit."
              : "Optional. Select a body area to add a finding at that location."}
          </p>
        </div>
        <span className="mt-0.5 inline-flex min-w-[20px] flex-none items-center justify-center rounded-sm bg-[#F3F4F6] px-1.5 py-0.5 text-[11px] font-semibold text-[#374151]">
          {findings.length}
        </span>
      </div>

      <div className="px-4 pb-3 pt-3">
        <BodyFigure
          findings={findings}
          sex={sex}
          side={side}
          onToggleSide={dialog ? undefined : toggleSide}
          countByRegion={countByRegion}
          activeRegion={dialog?.region}
          readOnly={readOnly}
          isDesktop={isDesktop}
          onOpen={(region, anchor) => onDialogChange({ region, side, anchor, editingId: null })}
        />
        <p className="mt-1 text-center text-[11px] text-[#6B7280]">
          {`${side === "front" ? "Front" : "Back"} view · R / L = patient's side`}
        </p>
      </div>

      <p className="border-t border-[#E5E7EB] px-4 py-2 text-[11px] leading-relaxed text-[#6B7280]">
        Added findings appear under Physical Examination. Documents location only, not a diagnosis.
      </p>

      {dialog && (
        <FindingDialog
          key={`${dialog.side}:${dialog.region}:${dialog.editingId || ""}`}
          region={dialog.region}
          side={dialog.side}
          anchor={dialog.anchor}
          initialEditingId={dialog.editingId}
          findings={findings.filter((item) => item.region === dialog.region && item.side === dialog.side)}
          readOnly={readOnly}
          onSave={saveFinding}
          onRemove={(id) => onChange(findings.filter((item) => item.id !== id))}
          onClose={handleClose}
        />
      )}
    </aside>
  );
}

/**
 * Body findings organised by body area and side, shown under the Physical
 * Examination findings textarea: front areas first, then back areas. The area
 * comes from the region and side that were selected, so it is never typed
 * again. Renders nothing until a finding exists - the body map stays optional.
 */
export function BodyFindingsList({ findings = [], readOnly = false, onEdit, onRemove }) {
  const groups = BODY_SIDES
    .flatMap((side) => BODY_REGIONS.map(({ key }) => ({
      id: `${side}:${key}`,
      label: getBodyRegionLabel(key, side),
      items: findings.filter((item) => item.side === side && item.region === key),
    })))
    .filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        Findings by body area
      </p>
      <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB]">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:gap-3">
            <p className="w-40 flex-none pt-1 text-xs font-semibold text-[#374151]">{group.label}</p>
            <ul className="min-w-0 flex-1 space-y-1">
              {group.items.map((item) => (
                <li key={item.id} className="flex items-start gap-1">
                  <div className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-[#111827]">
                    {item.location && <span className="break-words font-semibold">{item.location}: </span>}
                    <span className="break-words">{item.finding}</span>
                    {item.note && <span className="break-words text-[#6B7280]"> — {item.note}</span>}
                  </div>
                  {!readOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label={`Edit ${item.finding} (${group.label})`}
                        className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
                      >
                        <Pencil size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Remove ${item.finding} (${group.label})`}
                        className="flex h-7 w-7 flex-none items-center justify-center text-[#6B7280] hover:bg-red-50 hover:text-[#DC2626]"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
