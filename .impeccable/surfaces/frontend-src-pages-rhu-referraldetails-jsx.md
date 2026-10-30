# Surface: RHU Patient Arrival

primaryTarget: frontend/src/pages/rhu/ReferralDetails.jsx

## Direction contract

THESIS: This route is a receiving desk, not a clinical chart. Staff match the person in front of them to the BHC registration record and mark arrival. It refuses the long referral form that repeated chief complaint, vitals, and diagnosis before the patient was even received.

OWN-WORLD: Clinic Ledger. One white sheet on ledger paper, hairline rules, Inter, pill status and one Register Red Receive action. No nested cards, no slate costume, no clinical narrative blocks.

STORY: The receiving clerk reads name, birth date, age, sex, address, and contact; checks tracking ID, BHC, RHU, time, and status; confirms identity; receives. After success they see that the patient is on today's queue and cannot receive again.

FIRST VIEWPORT: Back link, compact identity header (name + status pill + birth/age/sex), two ruled columns (demographics | referral identification), one Receive Patient pill. Received state replaces the pill with a green confirmation line.

FORM: Established Clinic Ledger, Operate mode, code-led. Seed n/a — specified receiving workspace, not a new visual world.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
