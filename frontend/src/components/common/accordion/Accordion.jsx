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
    <div className={`flex flex-col gap-3 ${className}`}>
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
  );
}
