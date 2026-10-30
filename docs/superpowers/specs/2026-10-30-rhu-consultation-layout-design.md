# RHU consultation visual alignment

Eric approved matching every RHU consultation step to the existing BHC wizard: cards, spacing, header, navigation controls, fixed services/body preview, and form scrolling. RHU fields, step order, clinical workflow, permissions and persistence remain owned by RHU.

## Approaches

Selected: reuse the shared consultation CSS and layout roles. This keeps the visual contract consistent and avoids duplicate styling. Rejected: a separate RHU stylesheet copying BHC rules, which could drift.

## Architecture

React layout wrappers expose the existing BHC pinned layout at desktop widths (1024px and above). The form scrolls independently, panels occupy a second column only in Interview and Physical Examination, and the action bar stays outside the scroll area. Smaller screens stack content and use normal page scrolling. Use existing shadcn Card and action Button primitives with Tailwind and shared tokens. Review uses the shared recap cards. RHU service forms retain their fields and receive the same outer sheet finish.

No Laravel, PostgreSQL stored procedure, TanStack Query, payload, or clinical rule changes are needed. Preserve unrelated local changes. Browser inventory is empty in this session; report visual verification limits explicitly.

Eric additionally confirmed matching validation design. Replace the duplicate top-of-step error list with inline messages and the shared invalid-field border treatment. Chief Complaint and TB Case Number need explicit inline errors; existing history, vital, prenatal and care-plan field errors remain in their owning components. Preserve existing validation rules and server failure toast.
