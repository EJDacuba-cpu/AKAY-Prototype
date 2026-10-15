import { Cigarette, Salad, Wine } from "lucide-react";
import ProfileFactPopover from "./ProfileFactPopover";
import { arcPosition } from "../../../../utils/arcPlacement";

const ITEMS = [
  { key: "smoking", label: "Smoking", Icon: Cigarette, angle: -14 },
  { key: "alcohol", label: "Alcohol", Icon: Wine, angle: 0 },
  { key: "diet", label: "Diet", Icon: Salad, angle: 14 },
];

/**
 * Personal & social history under the body figure: smoking, alcohol and diet
 * exactly as recorded in the patient background (updated only in a
 * consultation). Neutral styling throughout - the row shows what was written
 * down and never grades it. With `arc` the three smaller controls tuck into
 * a curve just inside the clinical controls, hugging the figure's left side.
 */
export default function LifestyleRow({ personalSocial, openFact, onFactChange, arc = false }) {
  const social = personalSocial || {};

  return (
    <div role="group" aria-label="Lifestyle details" className={arc ? "contents" : "flex justify-center gap-8"}>
      {ITEMS.map(({ key, label, Icon, angle }) => {
        const value = String(social[key] || "").trim();
        return (
          <ProfileFactPopover
            key={key}
            label={label}
            Icon={Icon}
            side={arc ? "right" : "top"}
            open={openFact === key}
            onOpenChange={(open) => onFactChange(open ? key : null)}
            {...(arc ? { size: "sm", placement: "icon", style: arcPosition(angle, 0.25) } : {})}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-600">{value || "Not recorded"}</p>
          </ProfileFactPopover>
        );
      })}
    </div>
  );
}
