import { Cigarette, Salad, Wine } from "lucide-react";
import ProfileFactPopover from "./ProfileFactPopover";

const ITEMS = [
  { key: "smoking", label: "Smoking", Icon: Cigarette },
  { key: "alcohol", label: "Alcohol", Icon: Wine },
  { key: "diet", label: "Diet", Icon: Salad },
];

/**
 * Personal & social history under the body figure: smoking, alcohol and diet
 * exactly as recorded in the patient background (updated only in a
 * consultation). Neutral styling throughout - the row shows what was written
 * down and never grades it.
 */
export default function LifestyleRow({ personalSocial, openFact, onFactChange }) {
  const social = personalSocial || {};

  return (
    <div aria-label="Lifestyle details" className="flex justify-center gap-8">
      {ITEMS.map(({ key, label, Icon }) => {
        const value = String(social[key] || "").trim();
        return (
          <ProfileFactPopover key={key} label={label} Icon={Icon} side="top" open={openFact === key} onOpenChange={(open) => onFactChange(open ? key : null)}>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-600">{value || "Not recorded"}</p>
          </ProfileFactPopover>
        );
      })}
    </div>
  );
}
