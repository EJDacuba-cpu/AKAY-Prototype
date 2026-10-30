import { Cigarette, Salad, Wine } from "lucide-react";
import ProfileFactPopover from "./ProfileFactPopover";
import { arcPosition } from "../../../../utils/arcPlacement";
import { formatAlcohol, formatDiet, formatSmoking } from "../../../../utils/backgroundFormat";
import { packYears } from "../../../../utils/patientHistory";

const ITEMS = [
  { key: "smoking", label: "Smoking", Icon: Cigarette, angle: -14, read: (value) => formatSmoking(value, packYears(value || {})) },
  { key: "alcohol", label: "Alcohol", Icon: Wine, angle: 0, read: formatAlcohol },
  { key: "diet", label: "Diet", Icon: Salad, angle: 14, read: formatDiet },
];

/**
 * Personal & social history under the body figure: smoking, alcohol and diet
 * exactly as recorded in the patient background (updated only in a
 * consultation). Neutral styling throughout - the row shows what was written
 * down and never grades it. With `arc` the three smaller controls tuck into
 * a curve just inside the clinical controls, hugging the figure's left side.
 */
export default function LifestyleRow({ personalSocial, openFact, onFactChange, arc = false, rail = false }) {
  const social = personalSocial || {};

  return (
    <div role="group" aria-label="Lifestyle details" className={arc || rail ? "contents" : "flex justify-center gap-8"}>
      {ITEMS.map(({ key, label, Icon, angle, read }) => {
        const value = read(social[key]);
        return (
          <ProfileFactPopover
            key={key}
            label={label}
            Icon={Icon}
            side={rail ? "left" : arc ? "right" : "top"}
            open={openFact === key}
            onOpenChange={(open) => onFactChange(open ? key : null)}
            {...(rail ? { placement: "rail" } : arc ? { size: "sm", placement: "icon", style: arcPosition(angle, 0.25) } : {})}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-600">{value || "Not recorded"}</p>
          </ProfileFactPopover>
        );
      })}
    </div>
  );
}
