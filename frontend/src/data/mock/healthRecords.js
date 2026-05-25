/**
 * Mock Health Records Data
 */
export const mockHealthRecords = [
  {
    id: "HR-001",
    patientId: "P-001",
    patientName: "Maria Rosa",
    type: "Prenatal Checkup",
    date: "May 13, 2026",
    provider: "Dr. Santos",
    vitals: {
      bloodPressure: "120/80 mmHg",
      temperature: "37.0°C",
      weight: "65 kg",
      height: "165 cm",
    },
    notes: "Patient is in good condition. Continue prenatal vitamins.",
    nextVisit: "May 27, 2026",
  },
  {
    id: "HR-002",
    patientId: "P-002",
    patientName: "Juan Reyes",
    type: "Senior Health Check",
    date: "May 13, 2026",
    provider: "Dr. Lopez",
    vitals: {
      bloodPressure: "130/85 mmHg",
      temperature: "37.1°C",
      weight: "75 kg",
      height: "172 cm",
    },
    notes: "Slightly elevated BP. Recommended diet adjustment.",
    nextVisit: "June 10, 2026",
  },
  {
    id: "HR-003",
    patientId: "P-003",
    patientName: "John Cruz",
    type: "General Consultation",
    date: "May 12, 2026",
    provider: "Dr. Garcia",
    vitals: {
      bloodPressure: "118/76 mmHg",
      temperature: "36.8°C",
      weight: "80 kg",
      height: "178 cm",
    },
    notes: "Patient reported mild cough. Prescribed antibiotics.",
    nextVisit: "May 26, 2026",
  },
];

export default mockHealthRecords;
