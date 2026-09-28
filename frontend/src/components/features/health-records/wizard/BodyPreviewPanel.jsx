import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import useMediaQuery from "../../../../hooks/useMediaQuery";
import {
  BODY_FINDING_LIMITS,
  BODY_REGIONS,
  OTHER_LOCATION,
  createBodyFindingId,
  getBodyRegionLabel,
  getSpecificLocationOptions,
  resolveSpecificLocation,
  splitSpecificLocation,
} from "../../../../utils/bodyFindings";

/**
 * 2D body preview for the Physical Exam & Assessment step: sits in the fixed
 * right-hand column where Programs & Monitoring sits on the Interview step.
 *
 * Optional. It documents WHERE on the body a finding was noted for this visit
 * - it never suggests symptoms, diagnoses or interpretations. A plain, neutral
 * standing figure carries one small dot per body area; clicking (or tapping,
 * or Enter/Space on) a dot opens the finding input: anchored beside the dot
 * from 1024px, a bottom sheet below that. On desktop, hovering or focusing a
 * dot previews its findings in a small callout - it never replaces opening
 * the dialog to add or edit one. Added findings are listed by body area under
 * Physical Examination (BodyFindingsList).
 *
 * The figure is front-facing, so the PATIENT's right side is drawn on the
 * viewer's left; the R / L markers say so.
 */

// viewBox 0 0 200 400. A plain, non-interactive silhouette - segmented only
// so it reads as a figure, never highlighted or hit-tested per segment.
const FIGURE_SHAPES = [
  { type: "circle", cx: 100, cy: 34, r: 22 },
  { type: "rect", x: 91, y: 57, width: 18, height: 11, rx: 3 },
  { type: "path", d: "M66 72 Q100 64 134 72 Q142 75 142 84 L138 146 L62 146 L58 84 Q58 75 66 72 Z" },
  { type: "path", d: "M62 149 L138 149 L136 198 L64 198 Z" },
  { type: "path", d: "M64 201 L136 201 L140 232 Q120 244 100 246 Q80 244 60 232 Z" },
  { type: "path", d: "M55 76 Q44 80 42 94 L36 160 L30 224 Q29 236 38 237 Q44 236 45 226 L51 164 L56 110 Z" },
  { type: "path", d: "M145 76 Q156 80 158 94 L164 160 L170 224 Q171 236 162 237 Q156 236 155 226 L149 164 L144 110 Z" },
  { type: "path", d: "M61 236 Q80 247 98 249 L96 318 L93 376 Q92 386 83 386 Q75 386 75 376 L71 318 Z" },
  { type: "path", d: "M139 236 Q120 247 102 249 L104 318 L107 376 Q108 386 117 386 Q125 386 125 376 L129 318 Z" },
];

// One dot per body area, placed over the silhouette above. Hands sit at the
// wrist end of each arm, feet at the ankle end of each leg - no separate
// hand/foot shapes are drawn.
const DOT_POSITIONS = {
  head: [100, 32],
  chest: [100, 106],
  abdomen: [100, 174],
  pelvis: [100, 222],
  right_arm: [50, 130],
  left_arm: [150, 130],
  right_hand: [39, 232],
  left_hand: [161, 232],
  right_leg: [84, 292],
  left_leg: [116, 292],
  right_foot: [80, 384],
  left_foot: [120, 384],
};

const DESKTOP_QUERY = "(min-width: 1024px)";
const DIALOG_WIDTH = 288;
const GAP = 12;
const EDGE = 8;
const HIT_RADIUS = 14;
const DOT_RADIUS = 6;
const RING_RADIUS = 9;
const BADGE_RADIUS = 6.5;

function RegionShape({ shape, className }) {
  if (shape.type === "circle") return <circle cx={shape.cx} cy={shape.cy} r={shape.r} className={className} />;
  if (shape.type === "rect") {
    return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} className={className} />;
  }
  return <path d={shape.d} className={className} />;
}

/** The standing figure itself - a fixed outline, never clickable or tinted. */
function FigureOutline() {
  return (
    <g aria-hidden="true">
      {FIGURE_SHAPES.map((shape, index) => (
        <RegionShape key={index} shape={shape} className="fill-[#F9FAFB] stroke-[#D1D5DB] stroke-[1.5]" />
      ))}
    </g>
  );
}

/** One body-area dot: neutral by default, AKAY red once it has a finding. */
function BodyDot({ region, label, count, active, hovered, readOnly, onOpen, onHoverStart, onHoverEnd }) {
  const [x, y] = DOT_POSITIONS[region];
  const hasFindings = count > 0;
  const highlighted = active || hovered;
  const dotTone = hasFindings ? "fill-[#DC2626] stroke-white" : "fill-white stroke-[#9CA3AF]";
  const fullLabel = `${label}${hasFindings ? `, ${count} finding${count === 1 ? "" : "s"}` : ""}`;

  return (
    <g
      data-region={region}
      role={readOnly ? "img" : "button"}
      tabIndex={readOnly ? -1 : 0}
      aria-label={readOnly ? fullLabel : `${fullLabel}. Add a finding`}
      onClick={readOnly ? undefined : (event) => onOpen(region, event.currentTarget)}
      onKeyDown={readOnly ? undefined : (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(region, event.currentTarget);
        }
      }}
      onMouseEnter={() => onHoverStart(region)}
      onMouseLeave={() => onHoverEnd(region)}
      onFocus={() => onHoverStart(region)}
      onBlur={() => onHoverEnd(region)}
      className={`outline-none ${readOnly ? "" : "cursor-pointer"}`}
    >
      {/* Larger, invisible hit area - the visible dot stays small and clean. */}
      <circle cx={x} cy={y} r={HIT_RADIUS} className="fill-transparent" />
      {highlighted && <circle cx={x} cy={y} r={RING_RADIUS} className="fill-none stroke-[#DC2626] stroke-2" />}
      <circle cx={x} cy={y} r={DOT_RADIUS} className={`${dotTone} stroke-[1.5] transition-colors duration-150`} />
      {count >= 2 && (
        <g pointerEvents="none">
          <circle cx={x + 7} cy={y - 7} r={BADGE_RADIUS} className="fill-[#DC2626] stroke-white stroke-[1.5]" />
          <text x={x + 7} y={y - 7} textAnchor="middle" dominantBaseline="central" className="fill-white text-[8px] font-bold">
            {count}
          </text>
        </g>
      )}
    </g>
  );
}

/**
 * The figure plus, on desktop only, a hover/focus preview: a short connector
 * line and callout card for a dot with findings, or a plain label for one
 * without. Decorative only - the dot's own aria-label already carries this
 * information, so the preview is hidden from assistive tech. Clicking still
 * goes through onOpen regardless of hover state.
 */
function BodyFigure({ findings, countByRegion, activeRegion, readOnly, isDesktop, onOpen }) {
  const [hoveredRegion, setHoveredRegion] = useState(null);

  function hoverStart(region) {
    if (!isDesktop || activeRegion) return;
    setHoveredRegion(region);
  }
  function hoverEnd(region) {
    setHoveredRegion((current) => (current === region ? null : current));
  }

  const overlayRegion = activeRegion ? null : hoveredRegion;
  const overlayCount = overlayRegion ? countByRegion[overlayRegion] || 0 : 0;
  const overlayFinding = overlayRegion ? findings.find((item) => item.region === overlayRegion) : null;
  const [overlayX, overlayY] = overlayRegion ? DOT_POSITIONS[overlayRegion] : [0, 0];
  const overlaySide = overlayX <= 100 ? "right" : "left";
  const overlayStyle = overlayRegion
    ? overlaySide === "right"
      ? { top: `${(overlayY / 400) * 100}%`, left: `${(overlayX / 200) * 100}%`, transform: "translateY(-50%)" }
      : { top: `${(overlayY / 400) * 100}%`, right: `${100 - (overlayX / 200) * 100}%`, transform: "translateY(-50%)" }
    : null;

  return (
    <div className="relative mx-auto w-full max-w-[190px]">
      <svg viewBox="0 0 200 400" className="mx-auto block h-auto w-full select-none">
        <title>Front-facing body figure</title>
        <text x="14" y="18" className="fill-[#6B7280] text-[11px] font-semibold">R</text>
        <text x="180" y="18" className="fill-[#6B7280] text-[11px] font-semibold">L</text>
        <FigureOutline />
        {BODY_REGIONS.map((region) => (
          <BodyDot
            key={region.key}
            region={region.key}
            label={region.label}
            count={countByRegion[region.key] || 0}
            active={activeRegion === region.key}
            hovered={hoveredRegion === region.key}
            readOnly={readOnly}
            onOpen={onOpen}
            onHoverStart={hoverStart}
            onHoverEnd={hoverEnd}
          />
        ))}
      </svg>

      {overlayRegion && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-10 flex items-center ${overlaySide === "right" ? "flex-row" : "flex-row-reverse"}`}
          style={overlayStyle}
        >
          {overlayCount > 0 && (
            <span
              className={`bp-callout-line h-px w-3.5 flex-none bg-[#111827] ${overlaySide === "right" ? "origin-left" : "origin-right"}`}
            />
          )}
          <div
            className={`${overlayCount > 0 ? "bp-callout-card w-[168px] px-2.5 py-2" : "bp-tooltip whitespace-nowrap px-2 py-1"} border border-[#111827] bg-[#111827] text-[11px] leading-snug text-white shadow-lg`}
          >
            <p className="font-semibold">{getBodyRegionLabel(overlayRegion)}</p>
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
    </div>
  );
}

/**
 * The input for one region: its findings (each editable and removable) and a
 * single free-text Finding field with an optional note. Nothing is suggested
 * or inferred - the user writes the finding. A native modal <dialog> (focus
 * trap, Esc, backdrop), placed beside the dot from 1024px and as a bottom
 * sheet below that.
 *
 * Below 1024px, a region that already has findings opens straight to that
 * summary - the add/edit form only appears once "Add finding" is tapped, or
 * immediately when editing a specific entry. A region with no findings yet
 * opens straight to the form, so there's no empty summary to tap through.
 */
function FindingDialog({ region, anchor, findings, initialEditingId, readOnly, onSave, onRemove, onClose }) {
  const dialogRef = useRef(null);
  const findingInputRef = useRef(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const initial = findings.find((item) => item.id === initialEditingId) || null;
  const [editingId, setEditingId] = useState(initial?.id || null);
  const [finding, setFinding] = useState(initial?.finding || "");
  const [note, setNote] = useState(initial?.note || "");
  const initialLocation = splitSpecificLocation(region, initial?.location);
  const [locationChoice, setLocationChoice] = useState(initialLocation.choice);
  const [otherLocation, setOtherLocation] = useState(initialLocation.other);
  const [formOpen, setFormOpen] = useState(() => Boolean(initial) || findings.length === 0);
  const otherLocationRef = useRef(null);
  const locationOptions = getSpecificLocationOptions(region);
  const titleId = `body-finding-title-${region}`;
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
      if (!desktop || !anchor?.isConnected) {
        Object.assign(dialog.style, { position: "fixed", left: "0", right: "0", top: "auto", bottom: "0" });
        return;
      }
      const rect = anchor.getBoundingClientRect();
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
  }, [anchor]);

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
      location: resolveSpecificLocation(locationChoice, otherLocation),
      finding: text,
      note: note.trim(),
    });
    resetForm();
    findingInputRef.current?.focus();
  }

  function startEdit(item) {
    const split = splitSpecificLocation(region, item.location);
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
          <h2 id={titleId} className="text-[14px] font-bold leading-snug">{getBodyRegionLabel(region)}</h2>
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

/** The figure's dot element, used to anchor the dialog beside it. */
export function getBodyRegionAnchor(region) {
  if (typeof document === "undefined") return null;
  return document.querySelector(`[data-body-preview] [data-region="${region}"]`);
}

/**
 * @param findings       [{ id, region, location, finding, note }]
 * @param onChange       receives the next findings list
 * @param readOnly       view only (locked review / patient gate)
 * @param dialog         { region, anchor, editingId } while the input is open, else null
 * @param onDialogChange opens (object) or closes (null) the input; owned by the
 *                       page so the Physical Examination list can open it too
 */
export default function BodyPreviewPanel({ findings = [], onChange, readOnly = false, dialog, onDialogChange }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const countByRegion = findings.reduce((counts, item) => {
    counts[item.region] = (counts[item.region] || 0) + 1;
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
          countByRegion={countByRegion}
          activeRegion={dialog?.region}
          readOnly={readOnly}
          isDesktop={isDesktop}
          onOpen={(region, anchor) => onDialogChange({ region, anchor, editingId: null })}
        />
        <p className="mt-1 text-center text-[11px] text-[#6B7280]">Front view · R / L = patient&apos;s side</p>
      </div>

      <p className="border-t border-[#E5E7EB] px-4 py-2 text-[11px] leading-relaxed text-[#6B7280]">
        Added findings appear under Physical Examination. Documents location only, not a diagnosis.
      </p>

      {dialog && (
        <FindingDialog
          key={`${dialog.region}:${dialog.editingId || ""}`}
          region={dialog.region}
          anchor={dialog.anchor}
          initialEditingId={dialog.editingId}
          findings={findings.filter((item) => item.region === dialog.region)}
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
 * Body findings organised by body area, shown under the Physical Examination
 * findings textarea. The area comes from the region that was selected, so it
 * is never typed again. Renders nothing until a finding exists - the body map
 * stays optional.
 */
export function BodyFindingsList({ findings = [], readOnly = false, onEdit, onRemove }) {
  const groups = BODY_REGIONS
    .map((region) => ({ ...region, items: findings.filter((item) => item.region === region.key) }))
    .filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#374151]">
        Findings by body area
      </p>
      <div className="divide-y divide-[#E5E7EB] border border-[#E5E7EB]">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:gap-3">
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
