import { RotateCcw } from "lucide-react";

import { FIGURE_ASPECT, getFigureKey } from "../../../utils/bodyFigureGeometry";
import femaleBack from "../../../assets/anatomy/female-back.webp";
import femaleFront from "../../../assets/anatomy/female-front.webp";
import maleBack from "../../../assets/anatomy/male-back.webp";
import maleFront from "../../../assets/anatomy/male-front.webp";

const FIGURE_IMAGES = {
  male: { front: maleFront, back: maleBack },
  female: { front: femaleFront, back: femaleBack },
};

const LABEL_CLASS = "pointer-events-none absolute top-[18%] -translate-y-1/2 select-none text-[11px] font-semibold text-slate-400";

/**
 * Presentation-only male/female body figure shared by the consultation's
 * Physical Exam step and the patient profile's Visual Health Summary. It draws
 * the front or back image for `sex`, the R / L side labels and an optional
 * flip button; the caller owns `side` and all findings, hover and selection
 * logic. `children` render in a layer above the image: position markers there
 * with markerStyle() from bodyFigureGeometry. The box keeps the images'
 * aspect ratio, so the caller sizes it with `className` (width or height).
 * Front view: the PATIENT's right is on the viewer's left. Back view: swapped.
 */
export default function AnatomyFigure({ sex, side, onToggleSide, flipHint = false, className = "", label, children }) {
  const figure = getFigureKey(sex);
  const [leftLabel, rightLabel] = side === "front" ? ["R", "L"] : ["L", "R"];
  const flipLabel = side === "front" ? "Show back" : "Show front";

  return (
    <figure aria-label={label} className={`relative m-0 ${className}`} style={{ aspectRatio: FIGURE_ASPECT }}>
      <img
        key={`${figure}-${side}`}
        src={FIGURE_IMAGES[figure][side]}
        alt=""
        draggable={false}
        decoding="async"
        className="anatomy-fade-in absolute inset-0 h-full w-full select-none object-contain"
      />

      <span aria-hidden="true" className={`${LABEL_CLASS} left-1`}>
        {leftLabel}
      </span>
      <span aria-hidden="true" className={`${LABEL_CLASS} right-1`}>
        {rightLabel}
      </span>

      <div className="absolute inset-0">{children}</div>

      {onToggleSide && (
        <button
          type="button"
          onClick={onToggleSide}
          aria-label={flipLabel}
          title={flipLabel}
          className={`absolute right-0 top-0 z-10 inline-flex h-8 w-8 items-center justify-center rounded-none border border-slate-300 bg-white text-slate-600 transition-colors hover:border-red-600 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600${flipHint ? " anatomy-flip-hint" : ""}`}
        >
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      )}

      <span aria-live="polite" className="sr-only">
        {side === "front" ? "Front view" : "Back view"}
      </span>
    </figure>
  );
}
