# RHU Walk-in Check-in UI polish — Design

Status: approved for implementation (GOAL / CONTEXT / OUTPUT from Eric, 2026-11-05).

## Intent

Tighten Walk-in Check-in layout to match Incoming Referrals and Medicine sheet density. Visual only; no behavior or API changes.

## Layout

1. **Page header** (upper row): left — heading **Walk-in Check-in** + short subtitle; right — brand red pill **Register New Patient** (Plus icon), same placement energy as Incoming Referrals **QR Scan** / former queue CTA.
2. **Find a Patient** card below: white sheet, hairline border, `rounded-xl`, card shadow. Header title **Find a Patient** + subtitle that staff should search existing records before registering.
3. **Search** inside the card: existing `SearchField` (h-9, not stretched into a tall empty region).
4. **Results**: compact rows (≈56px), name + age/sex + id details (birthdate / PhilHealth / contact / barangay when present) + **Check in** / already-in-queue.
5. **States**: idle / loading / empty / error with modest vertical padding (no `min-h-[200px]` / `py-8` voids).
6. **Selected patient** (`?patient_id=`): keep above the Find card as a compact sheet; Clear remains.

## Non-goals

Search/check-in/confirm/register navigation logic, permissions, APIs, Today's Queue, Patient Details, other modules.
