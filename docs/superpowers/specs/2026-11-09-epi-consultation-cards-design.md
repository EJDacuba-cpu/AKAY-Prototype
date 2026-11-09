# EPI consultation cards

Approved in chat on 2026-11-09.

The Start Consultation EPI form in BHC and RHU must use separate section cards matching Patient Interview and Physical Examination: the same white surface, border, radius, shadow, divided header, padding, and 16px gaps.

## Approaches

Use the existing consultation sheet styles for each EPI section. This preserves the established layout and makes each section recognizable. One card around the entire form would leave the individual sections inconsistent with Interview; a new visual system would work against the requested match.

## Scope

- Card sections: basic monitoring when shown, newborn screening when applicable, vaccines, breastfeeding monitoring, and remarks.
- Match the conditional BHC vaccine inventory section to the same card treatment.
- Preserve field labels, order, visibility, callbacks, vaccine history locks, completion messages, validation, permissions, and saved payloads.
- Keep the patient profile, clinical rules, other service forms, and backend unchanged.
- Keep cards usable at desktop and phone widths; do not nest the form in another card.

## Verification

Run the frontend build, lint the changed components, and run the existing EPI tracking/applicability tests. Inspect desktop/mobile renders if a local browser is available. No new tests are needed for this reversible presentation change.
