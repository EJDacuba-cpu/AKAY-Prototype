import { Link, useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  User,
  MapPin,
  Phone,
  Calendar,
  FileText,
  HeartPulse,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Baby,
  UserRound,
  Stethoscope,
  ClipboardList,
  Share2,
  FilePlus2,
  Eye,
  Plus,
} from "lucide-react";
import DashboardLayout from "../../layouts/DashboardLayout";

/* ─── Keyframes ─── */
const keyframes = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .anim-fade-up { animation: fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) both; }
`;
const stagger = (i) => ({ animationDelay: `${i * 65}ms` });

/* ─── Mock Data ─── */
const patientDB = {
  "P-001": {
    id: "P-001",
    name: "Maria Rosa",
    ageSex: "31/F",
    barangay: "Bagumbayan",
    contact: "0917-123-4567",
    category: "Pregnant Patient",
    urgency: "Urgent",
    type: "Referred",
    civilStatus: "Married",
    birthday: "March 15, 1995",
    bloodType: "O+",
    philhealth: "12-345678901-2",
    status: "For Referral",
    registered: "January 10, 2026",
    lastVisit: "May 13, 2026",
    records: [
      {
        id: "HR-001",
        visitType: "Consultation",
        concern: "Abdominal pain",
        source: "RHU Walk-in",
        date: "May 13, 2026",
        status: "For Referral",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-008",
        visitType: "Prenatal",
        concern: "Routine check-up",
        source: "RHU Walk-in",
        date: "April 25, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-012",
        visitType: "Follow-up",
        concern: "Blood pressure monitoring",
        source: "BHC Referral",
        date: "April 10, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-019",
        visitType: "Prenatal",
        concern: "First trimester screening",
        source: "RHU Walk-in",
        date: "March 5, 2026",
        status: "Completed",
        recordedBy: "RHU Duty Doctor",
      },
    ],
  },
  "P-002": {
    id: "P-002",
    name: "Juan Reyes",
    ageSex: "65/M",
    barangay: "Balubad",
    contact: "0918-234-5678",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Widowed",
    birthday: "August 22, 1960",
    bloodType: "A+",
    philhealth: "34-567890123-4",
    status: "For Monitoring",
    registered: "February 3, 2026",
    lastVisit: "May 13, 2026",
    records: [
      {
        id: "HR-002",
        visitType: "Follow-up",
        concern: "Hypertension",
        source: "BHC Referral",
        date: "May 13, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-009",
        visitType: "Consultation",
        concern: "High blood pressure",
        source: "RHU Walk-in",
        date: "April 18, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-022",
        visitType: "Follow-up",
        concern: "Blood pressure check",
        source: "BHC Referral",
        date: "March 20, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-003": {
    id: "P-003",
    name: "John Cruz",
    ageSex: "45/M",
    barangay: "Bambang",
    contact: "0919-345-6789",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Single",
    birthday: "November 8, 1980",
    bloodType: "B+",
    philhealth: "56-789012345-6",
    status: "Active",
    registered: "March 15, 2026",
    lastVisit: "May 12, 2026",
    records: [
      {
        id: "HR-003",
        visitType: "Consultation",
        concern: "Persistent cough",
        source: "RHU Walk-in",
        date: "May 12, 2026",
        status: "Active",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-015",
        visitType: "Follow-up",
        concern: "Cough re-evaluation",
        source: "RHU Walk-in",
        date: "April 5, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-004": {
    id: "P-004",
    name: "David Perez",
    ageSex: "44/M",
    barangay: "Matungao",
    contact: "0920-456-7890",
    category: "Immunization",
    urgency: "Routine",
    type: "Referred",
    civilStatus: "Married",
    birthday: "June 30, 1981",
    bloodType: "AB+",
    philhealth: "78-901234567-8",
    status: "Completed",
    registered: "April 1, 2026",
    lastVisit: "May 12, 2026",
    records: [
      {
        id: "HR-004",
        visitType: "Immunization",
        concern: "Vaccine schedule",
        source: "BHC Referral",
        date: "May 12, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-018",
        visitType: "Consultation",
        concern: "Vaccine eligibility assessment",
        source: "BHC Referral",
        date: "April 15, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-005": {
    id: "P-005",
    name: "Antonio Santos",
    ageSex: "29/M",
    barangay: "San Francisco",
    contact: "0921-567-8901",
    category: "General Consultation",
    urgency: "Urgent",
    type: "Walk-in",
    civilStatus: "Single",
    birthday: "February 14, 1997",
    bloodType: "O-",
    philhealth: "90-123456789-0",
    status: "Active",
    registered: "March 20, 2026",
    lastVisit: "May 11, 2026",
    records: [
      {
        id: "HR-005",
        visitType: "Consultation",
        concern: "Severe headache",
        source: "RHU Walk-in",
        date: "May 11, 2026",
        status: "Active",
        recordedBy: "RHU Duty Doctor",
      },
    ],
  },
  "P-006": {
    id: "P-006",
    name: "Ana Liza Mendoza",
    ageSex: "27/F",
    barangay: "Bagumbayan",
    contact: "0922-678-9012",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "July 9, 1998",
    bloodType: "A-",
    philhealth: "11-234567890-1",
    status: "Active",
    registered: "February 14, 2026",
    lastVisit: "May 11, 2026",
    records: [
      {
        id: "HR-006",
        visitType: "Prenatal",
        concern: "Second trimester check-up",
        source: "RHU Walk-in",
        date: "May 11, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-024",
        visitType: "Prenatal",
        concern: "Routine prenatal visit",
        source: "RHU Walk-in",
        date: "April 8, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-031",
        visitType: "Prenatal",
        concern: "Initial prenatal assessment",
        source: "BHC Referral",
        date: "February 20, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-007": {
    id: "P-007",
    name: "Rosa Linda Garcia",
    ageSex: "68/F",
    barangay: "Balubad",
    contact: "0923-789-0123",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Widowed",
    birthday: "September 3, 1957",
    bloodType: "B-",
    philhealth: "22-345678901-3",
    status: "For Monitoring",
    registered: "January 22, 2026",
    lastVisit: "May 10, 2026",
    records: [
      {
        id: "HR-007",
        visitType: "Follow-up",
        concern: "Diabetes monitoring",
        source: "RHU Walk-in",
        date: "May 10, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-026",
        visitType: "Consultation",
        concern: "Elevated blood sugar",
        source: "BHC Referral",
        date: "March 28, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-034",
        visitType: "Senior Citizen Check-up",
        concern: "Annual wellness exam",
        source: "RHU Walk-in",
        date: "January 28, 2026",
        status: "Completed",
        recordedBy: "RHU Duty Doctor",
      },
    ],
  },
  "P-008": {
    id: "P-008",
    name: "Carlos Dela Cruz",
    ageSex: "52/M",
    barangay: "Bambang",
    contact: "0924-890-1234",
    category: "General Consultation",
    urgency: "Urgent",
    type: "Referred",
    civilStatus: "Married",
    birthday: "December 1, 1973",
    bloodType: "O+",
    philhealth: "33-456789012-4",
    status: "For Referral",
    registered: "March 5, 2026",
    lastVisit: "May 10, 2026",
    records: [
      {
        id: "HR-010",
        visitType: "Referral Assessment",
        concern: "Chest pain assessment",
        source: "BHC Referral",
        date: "May 10, 2026",
        status: "For Referral",
        recordedBy: "RHU Duty Doctor",
      },
      {
        id: "HR-028",
        visitType: "Consultation",
        concern: "Recurring chest discomfort",
        source: "BHC Referral",
        date: "April 12, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-036",
        visitType: "Consultation",
        concern: "Mild chest pain",
        source: "RHU Walk-in",
        date: "March 10, 2026",
        status: "Completed",
        recordedBy: "RHU Duty Doctor",
      },
    ],
  },
  "P-009": {
    id: "P-009",
    name: "Elena Domingo",
    ageSex: "34/F",
    barangay: "Matungao",
    contact: "0925-901-2345",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "April 22, 1992",
    bloodType: "B+",
    philhealth: "44-567890123-5",
    status: "Active",
    registered: "January 30, 2026",
    lastVisit: "May 9, 2026",
    records: [
      {
        id: "HR-011",
        visitType: "Prenatal",
        concern: "Third trimester check-up",
        source: "RHU Walk-in",
        date: "May 9, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-029",
        visitType: "Prenatal",
        concern: "Growth monitoring",
        source: "RHU Walk-in",
        date: "April 1, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-037",
        visitType: "Prenatal",
        concern: "Routine check-up",
        source: "RHU Walk-in",
        date: "February 15, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-010": {
    id: "P-010",
    name: "Ricardo Torres",
    ageSex: "71/M",
    barangay: "San Francisco",
    contact: "0926-012-3456",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Referred",
    civilStatus: "Married",
    birthday: "October 18, 1954",
    bloodType: "A+",
    philhealth: "55-678901234-6",
    status: "Completed",
    registered: "February 20, 2026",
    lastVisit: "May 9, 2026",
    records: [
      {
        id: "HR-013",
        visitType: "Follow-up",
        concern: "Post-surgery recovery",
        source: "BHC Referral",
        date: "May 9, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-030",
        visitType: "Consultation",
        concern: "Wound care follow-up",
        source: "BHC Referral",
        date: "April 3, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-038",
        visitType: "Senior Citizen Check-up",
        concern: "General assessment",
        source: "RHU Walk-in",
        date: "February 25, 2026",
        status: "Completed",
        recordedBy: "RHU Duty Doctor",
      },
    ],
  },
  "P-011": {
    id: "P-011",
    name: "Grace Villanueva",
    ageSex: "23/F",
    barangay: "Bagumbayan",
    contact: "0927-123-4570",
    category: "Immunization",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Single",
    birthday: "May 28, 2002",
    bloodType: "AB-",
    philhealth: "66-789012345-7",
    status: "Completed",
    registered: "April 10, 2026",
    lastVisit: "May 8, 2026",
    records: [
      {
        id: "HR-014",
        visitType: "Immunization",
        concern: "Flu vaccine",
        source: "RHU Walk-in",
        date: "May 8, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-012": {
    id: "P-012",
    name: "Mark Anthony Lim",
    ageSex: "38/M",
    barangay: "Balubad",
    contact: "0928-234-5681",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "January 5, 1988",
    bloodType: "O+",
    philhealth: "77-890123456-8",
    status: "For Monitoring",
    registered: "March 8, 2026",
    lastVisit: "May 8, 2026",
    records: [
      {
        id: "HR-016",
        visitType: "Follow-up",
        concern: "UTI monitoring",
        source: "RHU Walk-in",
        date: "May 8, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-032",
        visitType: "Consultation",
        concern: "Urinary tract infection",
        source: "RHU Walk-in",
        date: "April 14, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-013": {
    id: "P-013",
    name: "Carmen Aquino",
    ageSex: "60/F",
    barangay: "Bambang",
    contact: "0929-345-6792",
    category: "Senior Citizen",
    urgency: "Urgent",
    type: "Referred",
    civilStatus: "Widowed",
    birthday: "August 11, 1965",
    bloodType: "A-",
    philhealth: "88-901234567-9",
    status: "For Referral",
    registered: "February 28, 2026",
    lastVisit: "May 7, 2026",
    records: [
      {
        id: "HR-017",
        visitType: "Referral Assessment",
        concern: "Severe joint pain",
        source: "BHC Referral",
        date: "May 7, 2026",
        status: "For Referral",
        recordedBy: "RHU Duty Doctor",
      },
      {
        id: "HR-033",
        visitType: "Consultation",
        concern: "Arthritis management",
        source: "BHC Referral",
        date: "April 2, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-039",
        visitType: "Senior Citizen Check-up",
        concern: "Bone density concern",
        source: "RHU Walk-in",
        date: "March 5, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-014": {
    id: "P-014",
    name: "Jose Ramirez",
    ageSex: "41/M",
    barangay: "Matungao",
    contact: "0930-456-7803",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "June 19, 1984",
    bloodType: "B+",
    philhealth: "99-012345678-0",
    status: "Active",
    registered: "April 5, 2026",
    lastVisit: "May 7, 2026",
    records: [
      {
        id: "HR-020",
        visitType: "Consultation",
        concern: "Skin allergy",
        source: "RHU Walk-in",
        date: "May 7, 2026",
        status: "Active",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-015": {
    id: "P-015",
    name: "Lourdes Fernandez",
    ageSex: "29/F",
    barangay: "San Francisco",
    contact: "0931-567-8914",
    category: "Pregnant Patient",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "November 3, 1996",
    bloodType: "O+",
    philhealth: "10-123456789-1",
    status: "Active",
    registered: "March 12, 2026",
    lastVisit: "May 6, 2026",
    records: [
      {
        id: "HR-021",
        visitType: "Prenatal",
        concern: "First prenatal visit",
        source: "RHU Walk-in",
        date: "May 6, 2026",
        status: "Active",
        recordedBy: "RHU Nurse Team",
      },
      {
        id: "HR-035",
        visitType: "Consultation",
        concern: "Pregnancy confirmation",
        source: "RHU Walk-in",
        date: "April 20, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
    ],
  },
  "P-016": {
    id: "P-016",
    name: "Pedro Santiago",
    ageSex: "55/M",
    barangay: "Bagumbayan",
    contact: "0932-678-9025",
    category: "General Consultation",
    urgency: "Routine",
    type: "Referred",
    civilStatus: "Married",
    birthday: "February 27, 1971",
    bloodType: "AB+",
    philhealth: "21-234567890-2",
    status: "Completed",
    registered: "March 25, 2026",
    lastVisit: "May 6, 2026",
    records: [
      {
        id: "HR-023",
        visitType: "Follow-up",
        concern: "Post-treatment check-up",
        source: "BHC Referral",
        date: "May 6, 2026",
        status: "Completed",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-040",
        visitType: "Consultation",
        concern: "Lower back pain",
        source: "BHC Referral",
        date: "April 10, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-017": {
    id: "P-017",
    name: "Mila Reyes",
    ageSex: "8/F",
    barangay: "Balubad",
    contact: "0933-789-0136",
    category: "Immunization",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Single",
    birthday: "September 12, 2017",
    bloodType: "O+",
    philhealth: "32-345678901-3",
    status: "Completed",
    registered: "April 18, 2026",
    lastVisit: "May 5, 2026",
    records: [
      {
        id: "HR-025",
        visitType: "Child Health Check-up",
        concern: "Growth monitoring and vaccination",
        source: "RHU Walk-in",
        date: "May 5, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-018": {
    id: "P-018",
    name: "Fernando Gonzales",
    ageSex: "73/M",
    barangay: "Bambang",
    contact: "0934-890-1247",
    category: "Senior Citizen",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "December 25, 1952",
    bloodType: "B-",
    philhealth: "43-456789012-4",
    status: "For Monitoring",
    registered: "January 15, 2026",
    lastVisit: "May 5, 2026",
    records: [
      {
        id: "HR-027",
        visitType: "Follow-up",
        concern: "Chronic kidney disease monitoring",
        source: "RHU Walk-in",
        date: "May 5, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-041",
        visitType: "Consultation",
        concern: "Kidney function review",
        source: "BHC Referral",
        date: "March 22, 2026",
        status: "Active",
        recordedBy: "RHU Duty Doctor",
      },
      {
        id: "HR-042",
        visitType: "Senior Citizen Check-up",
        concern: "Routine wellness check",
        source: "RHU Walk-in",
        date: "January 20, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-019": {
    id: "P-019",
    name: "Isabel Tolentino",
    ageSex: "32/F",
    barangay: "Matungao",
    contact: "0935-901-2358",
    category: "Pregnant Patient",
    urgency: "Urgent",
    type: "Referred",
    civilStatus: "Single",
    birthday: "March 30, 1994",
    bloodType: "A+",
    philhealth: "54-567890123-5",
    status: "For Referral",
    registered: "February 10, 2026",
    lastVisit: "May 4, 2026",
    records: [
      {
        id: "HR-043",
        visitType: "Referral Assessment",
        concern: "High-risk pregnancy evaluation",
        source: "BHC Referral",
        date: "May 4, 2026",
        status: "For Referral",
        recordedBy: "RHU Duty Doctor",
      },
      {
        id: "HR-044",
        visitType: "Prenatal",
        concern: "Gestational diabetes screening",
        source: "BHC Referral",
        date: "April 8, 2026",
        status: "For Monitoring",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-045",
        visitType: "Prenatal",
        concern: "Initial prenatal assessment",
        source: "RHU Walk-in",
        date: "February 18, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
  "P-020": {
    id: "P-020",
    name: "Roberto Navarro",
    ageSex: "48/M",
    barangay: "San Francisco",
    contact: "0936-012-3469",
    category: "General Consultation",
    urgency: "Routine",
    type: "Walk-in",
    civilStatus: "Married",
    birthday: "July 14, 1977",
    bloodType: "O+",
    philhealth: "65-678901234-6",
    status: "Active",
    registered: "April 8, 2026",
    lastVisit: "May 4, 2026",
    records: [
      {
        id: "HR-046",
        visitType: "Consultation",
        concern: "Acid reflux",
        source: "RHU Walk-in",
        date: "May 4, 2026",
        status: "Active",
        recordedBy: "Joshua Pio",
      },
      {
        id: "HR-047",
        visitType: "Follow-up",
        concern: "Stomach pain follow-up",
        source: "RHU Walk-in",
        date: "April 15, 2026",
        status: "Completed",
        recordedBy: "RHU Nurse Team",
      },
    ],
  },
};

/* ─── Fallback ─── */
const defaultPatient = {
  id: "P-000",
  name: "Unknown Patient",
  ageSex: "N/A",
  barangay: "N/A",
  contact: "N/A",
  category: "General Consultation",
  urgency: "Routine",
  type: "Walk-in",
  civilStatus: "N/A",
  birthday: "N/A",
  bloodType: "N/A",
  philhealth: "N/A",
  status: "Active",
  registered: "N/A",
  lastVisit: "N/A",
  records: [],
};

/* ─── Status map ─── */
const statusMap = {
  Active: { bg: "#ECFDF5", text: "#047857", dot: "#10B981" },
  "For Referral": { bg: "#FFF7ED", text: "#C2410C", dot: "#F97316" },
  "For Monitoring": { bg: "#FFFBEB", text: "#B45309", dot: "#F59E0B" },
  Completed: { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6" },
};

const categoryMap = {
  "Pregnant Patient": {
    bg: "#FDF2F8",
    text: "#9D174D",
    border: "#FBCFE8",
    icon: <Baby size={14} />,
  },
  "Senior Citizen": {
    bg: "#F5F3FF",
    text: "#5B21B6",
    border: "#DDD6FE",
    icon: <UserRound size={14} />,
  },
  "General Consultation": {
    bg: "#EFF6FF",
    text: "#1E40AF",
    border: "#BFDBFE",
    icon: <Stethoscope size={14} />,
  },
  Immunization: {
    bg: "#F0FDF4",
    text: "#166534",
    border: "#BBF7D0",
    icon: <HeartPulse size={14} />,
  },
};

/* ───────────────── MAIN ───────────────── */

export default function PatientDetails() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const patient = patientDB[patientId] || { ...defaultPatient, id: patientId };

  const s = statusMap[patient.status] || statusMap.Active;
  const c =
    categoryMap[patient.category] || categoryMap["General Consultation"];

  const hasRecords = patient.records.length > 0;
  const latestRecord = hasRecords ? patient.records[0] : null;

  const infoItems = [
    { label: "Age / Sex", value: patient.ageSex, icon: <User size={14} /> },
    { label: "Barangay", value: patient.barangay, icon: <MapPin size={14} /> },
    { label: "Contact", value: patient.contact, icon: <Phone size={14} /> },
    {
      label: "Civil Status",
      value: patient.civilStatus,
      icon: <User size={14} />,
    },
    {
      label: "Birthday",
      value: patient.birthday,
      icon: <Calendar size={14} />,
    },
    {
      label: "Blood Type",
      value: patient.bloodType,
      icon: <HeartPulse size={14} />,
    },
    {
      label: "PhilHealth No.",
      value: patient.philhealth,
      icon: <FileText size={14} />,
    },
    {
      label: "Registered",
      value: patient.registered,
      icon: <Calendar size={14} />,
    },
  ];

  const totalRecords = patient.records.length;
  const activeRecords = patient.records.filter(
    (r) => r.status === "Active",
  ).length;
  const completedRecords = patient.records.filter(
    (r) => r.status === "Completed",
  ).length;

  return (
    <DashboardLayout role="rhu" title="Patient Details">
      <style>{keyframes}</style>

      {/* ── Back ── */}
      <div className="anim-fade-up mb-6" style={stagger(0)}>
        <Link
          to="/rhu/patients"
          className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0B2E59] transition-all duration-200 hover:gap-2.5 hover:text-[#092347]"
        >
          <ArrowLeft size={16} />
          Back to Patient Registry
        </Link>
      </div>

      {/* ── Patient Header Card ── */}
      <div
        className="anim-fade-up mb-6 rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
        style={stagger(1)}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#EFF6FF] text-[#2563EB]">
              <User size={24} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-[#0B2E59]">
                  {patient.name}
                </h1>
                <span
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.dot }}
                  />
                  {patient.status}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-[#BCC3CD]">
                {patient.id}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-semibold"
                  style={{
                    backgroundColor: c.bg,
                    color: c.text,
                    borderColor: c.border,
                  }}
                >
                  {c.icon} {patient.category}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold ${patient.urgency === "Urgent" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${patient.urgency === "Urgent" ? "bg-orange-500" : "bg-emerald-500"}`}
                  />
                  {patient.urgency}
                </span>
                <span
                  className={`inline-block rounded-lg border px-2.5 py-1 text-[10px] font-semibold ${patient.type === "Walk-in" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}
                >
                  {patient.type}
                </span>
              </div>
            </div>
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {hasRecords ? (
              <>
                {/* View Latest Record */}
                <Link
                  to={`/rhu/health-records/${latestRecord.id}`}
                  className="group flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#2563EB]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1D4ED8] hover:shadow-lg"
                >
                  <Eye
                    size={14}
                    className="transition-transform duration-300 group-hover:scale-110"
                  />
                  View Latest Record
                </Link>

                {/* Add Record */}
                <Link
                  to={`/rhu/health-records/add?patientId=${patient.id}`}
                  className="group flex items-center gap-2 rounded-xl border border-[#E8ECF0] bg-white px-4 py-2.5 text-xs font-semibold text-[#4B5563] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D1D5DB] hover:shadow-md"
                >
                  <FilePlus2
                    size={14}
                    className="text-blue-500 transition-transform duration-300 group-hover:scale-110"
                  />
                  Add Record
                </Link>
              </>
            ) : (
              /* No records — prominent single button */
              <Link
                to={`/rhu/health-records/add?patientId=${patient.id}`}
                className="group flex items-center gap-2 rounded-xl bg-[#0B2E59] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#0B2E59]/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#082243] hover:shadow-lg"
              >
                <Plus
                  size={14}
                  className="transition-transform duration-300 group-hover:rotate-90"
                />
                Add First Record
              </Link>
            )}

            {/* Create Referral — only when status is For Referral */}
            {patient.status === "For Referral" && (
              <Link
                to={`/rhu/referrals/add?patientId=${patient.id}`}
                className="group flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-600/15 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg"
              >
                <Share2
                  size={14}
                  className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
                Create Referral
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <QuickStat
          label="Total Records"
          value={totalRecords}
          icon={<ClipboardList size={15} />}
          color="navy"
          delay={2}
        />
        <QuickStat
          label="Active"
          value={activeRecords}
          icon={<HeartPulse size={15} />}
          color="green"
          delay={3}
        />
        <QuickStat
          label="Completed"
          value={completedRecords}
          icon={<CheckCircle2 size={15} />}
          color="blue"
          delay={4}
        />
      </div>

      {/* ── Latest Record Preview (only when records exist) ── */}
      {hasRecords && (
        <div
          className="anim-fade-up mb-6 rounded-2xl border border-[#E8ECF0] bg-white shadow-sm"
          style={stagger(5)}
        >
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <FileText size={14} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Latest Record
              </h2>
              <span className="font-mono text-[11px] font-semibold text-[#2563EB]">
                {latestRecord.id}
              </span>
            </div>
            <Link
              to={`/rhu/health-records/${latestRecord.id}`}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#2563EB] transition-colors duration-150 hover:text-[#1D4ED8]"
            >
              View full details
              <ArrowLeft size={12} className="rotate-180" />
            </Link>
          </div>

          <div className="grid gap-0 divide-y divide-[#F8FAFC] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <RecordPreviewCell
              label="Visit Type"
              value={latestRecord.visitType}
            />
            <RecordPreviewCell label="Concern" value={latestRecord.concern} />
            <RecordPreviewCell label="Source" value={latestRecord.source} />
            <RecordPreviewCell
              label="Status"
              value={latestRecord.status}
              badge
              badgeStyle={statusMap[latestRecord.status] || statusMap.Active}
            />
          </div>

          <div className="grid gap-0 divide-x divide-[#F8FAFC] border-t border-[#F3F4F6] sm:grid-cols-2 lg:grid-cols-3">
            <RecordPreviewCell label="Date" value={latestRecord.date} />
            <RecordPreviewCell
              label="Recorded By"
              value={latestRecord.recordedBy}
            />
            <Link
              to={`/rhu/health-records/${latestRecord.id}`}
              className="hidden items-center justify-center gap-2 bg-[#FAFBFC] px-4 py-3.5 text-[12px] font-semibold text-[#2563EB] transition-colors duration-150 hover:bg-[#EFF6FF] lg:flex"
            >
              <Eye size={13} />
              Open Record
            </Link>
          </div>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Personal Information */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm"
            style={stagger(hasRecords ? 6 : 5)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <User size={14} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Personal Information
              </h2>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {infoItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] p-3.5"
                >
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white text-[#9CA3AF] shadow-sm">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                      {item.label}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-[#1A1A1A]">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Health Records Table */}
          <div
            className="anim-fade-up overflow-hidden rounded-2xl border border-[#E8ECF0] bg-white shadow-sm"
            style={stagger(hasRecords ? 7 : 6)}
          >
            <div className="flex items-center gap-2.5 border-b border-[#F3F4F6] px-6 py-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <FileText size={14} />
              </div>
              <h2 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Health Records
              </h2>
              <span className="rounded-lg bg-[#F3F4F6] px-2.5 py-1 text-[10px] font-semibold text-[#6B7280]">
                {totalRecords}
              </span>
            </div>
            {patient.records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3F4F6]">
                  <FileText size={20} className="text-[#9CA3AF]" />
                </div>
                <p className="text-xs font-semibold text-[#0B2E59]">
                  No health records yet
                </p>
                <p className="mt-1 text-[11px] text-[#9CA3AF]">
                  Add a health record to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-[#F3F4F6] bg-[#F9FAFB] text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                      <th className="px-6 py-3">Record ID</th>
                      <th className="px-4 py-3">Visit Type</th>
                      <th className="px-4 py-3">Concern</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Recorded By</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F8FAFC]">
                    {patient.records.map((record, idx) => {
                      const rs = statusMap[record.status] || statusMap.Active;
                      const isLatest = idx === 0;
                      return (
                        <tr
                          key={record.id}
                          className={`transition-colors duration-150 hover:bg-[#FAFBFD] ${isLatest ? "bg-[#FAFBFE]" : ""}`}
                        >
                          <td className="whitespace-nowrap px-6 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] font-semibold text-[#0B2E59]">
                                {record.id}
                              </span>
                              {isLatest && (
                                <span className="rounded bg-[#DBEAFE] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#2563EB]">
                                  Latest
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#4B5563]">
                            {record.visitType}
                          </td>
                          <td className="px-4 py-3.5 text-[13px] text-[#6B7280]">
                            {record.concern}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                            {record.source}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#9CA3AF]">
                            {record.date}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span
                              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] font-semibold"
                              style={{ backgroundColor: rs.bg, color: rs.text }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: rs.dot }}
                              />
                              {record.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-[#6B7280]">
                            {record.recordedBy}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right">
                            <Link
                              to={`/rhu/health-records/${record.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8ECF0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#2563EB] shadow-sm transition-all duration-200 hover:border-[#BFDBFE] hover:bg-[#EFF6FF] hover:shadow-md"
                            >
                              <Eye size={12} />
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right — Sidebar */}
        <div className="space-y-6">
          {/* Last Visit */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(hasRecords ? 8 : 7)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <Clock size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Last Visit
              </h3>
            </div>
            <p className="mt-4 text-lg font-bold text-[#0B2E59]">
              {patient.lastVisit}
            </p>
            <p className="mt-1 text-[11px] text-[#9CA3AF]">
              Most recent encounter date
            </p>
          </div>

          {/* Quick Actions */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(hasRecords ? 9 : 8)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <Stethoscope size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Quick Actions
              </h3>
            </div>
            <div className="mt-4 space-y-2">
              {/* View Latest Record — only when records exist */}
              {hasRecords && (
                <Link
                  to={`/rhu/health-records/${latestRecord.id}`}
                  className="flex w-full items-center gap-3 rounded-xl border-2 border-[#DBEAFE] bg-[#EFF6FF] px-4 py-3 text-[13px] font-semibold text-[#1D4ED8] transition-all duration-200 hover:bg-[#DBEAFE]"
                >
                  <Eye size={15} className="text-[#2563EB]" />
                  View Latest Record
                  <span className="ml-auto font-mono text-[10px] font-medium text-[#60A5FA]">
                    {latestRecord.id}
                  </span>
                </Link>
              )}

              <Link
                to={`/rhu/health-records/add?patientId=${patient.id}`}
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#DBEAFE] hover:bg-[#EFF6FF]"
              >
                <FilePlus2 size={15} className="text-blue-500" />
                {hasRecords ? "Add New Record" : "Add First Record"}
              </Link>

              <Link
                to="/rhu/health-records"
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#E2E8F0] hover:bg-[#F8FAFC]"
              >
                <FileText size={15} className="text-[#64748B]" />
                View All Health Records
              </Link>

              <Link
                to="/rhu/incoming-referrals"
                className="flex w-full items-center gap-3 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#1A1A1A] transition-all duration-200 hover:border-[#FED7AA] hover:bg-[#FFF7ED]"
              >
                <Share2 size={15} className="text-orange-500" />
                View Referrals
              </Link>
            </div>
          </div>

          {/* Status Note */}
          <div
            className="anim-fade-up rounded-2xl border border-[#E8ECF0] bg-white p-5 shadow-sm"
            style={stagger(hasRecords ? 10 : 9)}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                <AlertTriangle size={14} />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-[#0B2E59]">
                Status Note
              </h3>
            </div>
            <div className="mt-4">
              {patient.status === "For Referral" && (
                <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#9A3412]">
                    <span className="font-semibold">
                      Needs further referral.
                    </span>{" "}
                    This patient may need to be referred to a higher-level
                    facility. Coordinate with the attending physician for next
                    steps.
                  </p>
                </div>
              )}
              {patient.status === "For Monitoring" && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#92400E]">
                    <span className="font-semibold">Monitoring active.</span>{" "}
                    This patient needs regular follow-up visits. Ensure the next
                    visit is scheduled.
                  </p>
                </div>
              )}
              {patient.status === "Active" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#065F46]">
                    <span className="font-semibold">Active patient.</span> Open
                    health record with ongoing case management. No immediate
                    action required.
                  </p>
                </div>
              )}
              {patient.status === "Completed" && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-[12px] leading-relaxed text-[#1E40AF]">
                    <span className="font-semibold">Case completed.</span> All
                    scheduled visits and treatments for this patient have been
                    completed.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─── Quick Stat ─── */
function QuickStat({ label, value, icon, color = "navy", delay = 0 }) {
  const map = {
    navy: { border: "#0B2E59", iconBg: "#EFF6FF", iconColor: "#2563EB" },
    green: { border: "#059669", iconBg: "#ECFDF5", iconColor: "#059669" },
    blue: { border: "#2563EB", iconBg: "#EFF6FF", iconColor: "#2563EB" },
  };
  const s = map[color] || map.navy;
  return (
    <div
      className="anim-fade-up rounded-xl border border-[#E8ECF0] border-t-2 bg-white p-5 shadow-sm"
      style={{ borderTopColor: s.border, ...stagger(delay) }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9CA3AF]">
          {label}
        </p>
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: s.iconBg, color: s.iconColor }}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold leading-none tracking-tight text-[#0B2E59]">
        {value}
      </p>
    </div>
  );
}

/* ─── Record Preview Cell ─── */
function RecordPreviewCell({ label, value, badge, badgeStyle }) {
  return (
    <div className="flex flex-col justify-center px-6 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      {badge && badgeStyle ? (
        <span
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: badgeStyle.dot }}
          />
          {value}
        </span>
      ) : (
        <p className="mt-0.5 truncate text-[13px] font-semibold text-[#1A1A1A]">
          {value}
        </p>
      )}
    </div>
  );
}
