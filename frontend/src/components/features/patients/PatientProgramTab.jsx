import { Baby, HeartPulse } from "lucide-react";

/**
 * Display config for the conditional program areas (Women's Health and
 * Pediatric / EPI). `pending` lists the sections a program is meant to hold
 * that no field captures yet; Health Records shows them as "Not yet captured".
 */
export const AREA_CONFIG = {
  womensHealth: {
    icon: HeartPulse,
    title: "Women's Health",
    subtitle:
      "Prenatal, obstetric, maternal laboratory, and family planning records for this patient.",
    emptyText:
      "No women's health records for this patient yet. Records appear here once a Maternal / Prenatal or Family Planning visit is saved.",
    // Sections the program is meant to hold that no field captures yet.
    pending: [
      {
        title: "Obstetric Information",
        detail:
          "Gravida/Para/TPAL and obstetric summary are captured per prenatal visit today; a consolidated obstetric record is not stored at patient level yet.",
      },
      {
        title: "Maternal Laboratory Records",
        detail:
          "Laboratory results (CBC, HBsAg, blood typing, HIV, syphilis, urinalysis) are recorded per visit; a compiled laboratory history is not built yet.",
      },
      {
        title: "Ultrasound History",
        detail:
          "Ultrasound result and date are recorded per prenatal visit; a compiled ultrasound history is not built yet.",
      },
    ],
  },
  pediatric: {
    icon: Baby,
    title: "Pediatric / EPI",
    subtitle:
      "Immunization tracking and dose history for this patient's child health records.",
    emptyText:
      "No pediatric / EPI records for this patient yet. Records appear here once a Child Health / EPI visit is saved.",
    pending: [
      {
        title: "Growth Monitoring History",
        detail:
          "Weight, height, and temperature are recorded per EPI visit; a compiled growth chart is not built yet.",
      },
    ],
  },
};
