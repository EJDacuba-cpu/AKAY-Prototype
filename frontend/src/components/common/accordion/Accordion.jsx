import { useState } from "react";
import AccordionSection from "./AccordionSection";

export default function Accordion({
  sections = [],
  defaultOpenIds = [],
  allowMultipleOpen = true,
  className = "",
}) {
  const [openIds, setOpenIds] = useState(() => new Set(defaultOpenIds));

  function handleToggle(id, nextOpen) {
    setOpenIds((prev) => {
      const next = allowMultipleOpen ? new Set(prev) : new Set();
      if (nextOpen) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  return (
    <>
      <div className={`print:hidden flex flex-col gap-3 ${className}`}>
        {sections.map(({ id, title, icon, preview, badge, content }) => (
          <AccordionSection
            key={id}
            id={id}
            title={title}
            icon={icon}
            preview={preview}
            badge={badge}
            isOpen={openIds.has(id)}
            onToggle={handleToggle}
          >
            {content}
          </AccordionSection>
        ))}
      </div>

      {/* Flattened, always-expanded rendering — print only */}
      <div className={`hidden print:block ${className}`}>
        <div className="flex flex-col gap-4">
          {sections.map(({ id, title, badge, content }) => (
            <div key={id} className="break-inside-avoid-page">
              <h3 className="mb-2 border-b border-slate-300 pb-1 text-[13px] font-bold text-black">
                {title}
                {badge ? (
                  <span className="ml-2 text-[11px] font-normal text-slate-600">
                    ({badge})
                  </span>
                ) : null}
              </h3>
              <div className="text-[12px] leading-relaxed text-black">
                {content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
