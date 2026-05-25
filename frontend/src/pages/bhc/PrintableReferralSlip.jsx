import { ArrowLeft, Printer, QrCode } from "lucide-react";
import { Link } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";

export default function PrintableReferralSlip() {
  const referral = {
    trackingId: "AKY-2026-006",
    patientName: "Maria Rosa",
    ageSex: "31/F",
    referralCategory: "C2",
    priority: "High",
    referringBHC: "Pitpitan Health Center",
    referringPractitioner: "Lorna Reyes",
    rhuDestination: "Rural Health Unit of Bulakan",
    rhuLocation: "Bulakan, Bulacan",
    referralDate: "May 13, 2026",
    referralTime: "10:30 AM",
    chiefComplaint: "Abdominal pain",
    reasonForReferral: "Patient needs further RHU assessment.",
  };

  function handlePrint() {
    window.print();
  }

  return (
    <DashboardLayout role="bhc" title="Printable Referral Slip">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          to="/bhc/referrals"
          className="flex items-center gap-2 text-sm font-semibold text-[#0B2E59] hover:underline"
        >
          <ArrowLeft size={16} />
          Back to Referrals
        </Link>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-[#0B2E59] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092347]"
        >
          <Printer size={16} />
          Print Slip
        </button>
      </div>

      <div className="mx-auto max-w-4xl rounded-xl border border-[#E8ECF0] bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-[#E8ECF0] pb-5 text-center">
          <h1 className="text-2xl font-bold text-[#0B2E59]">AKAY</h1>
          <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
            Healthcare Coordination and Patient Monitoring System
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">
            Barangay Health Center to Rural Health Unit Referral Slip
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_160px]">
          <div>
            <h2 className="text-sm font-bold text-[#0B2E59]">
              Referral Information
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info label="Tracking ID" value={referral.trackingId} />
              <Info
                label="Referral Category"
                value={referral.referralCategory}
              />
              <Info label="Priority Level" value={referral.priority} />
              <Info label="Referral Date" value={referral.referralDate} />
              <Info label="Referral Time" value={referral.referralTime} />
              <Info label="Status" value="Pending" />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#0B2E59] bg-blue-50 p-4 text-[#0B2E59]">
            <QrCode size={82} />
            <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide">
              QR Verification
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
          <h2 className="text-sm font-bold text-[#0B2E59]">
            Patient Information
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="Patient Name" value={referral.patientName} />
            <Info label="Age/Sex" value={referral.ageSex} />
            <Info label="Chief Complaint" value={referral.chiefComplaint} />
            <Info
              label="Reason for Referral"
              value={referral.reasonForReferral}
            />
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
          <h2 className="text-sm font-bold text-[#0B2E59]">
            Referring Facility
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="Referring BHC" value={referral.referringBHC} />
            <Info
              label="Referring Practitioner"
              value={referral.referringPractitioner}
            />
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
          <h2 className="text-sm font-bold text-[#0B2E59]">RHU Destination</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="RHU Destination" value={referral.rhuDestination} />
            <Info label="RHU Location" value={referral.rhuLocation} />
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-[#0B2E59]">Reminder</p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Please proceed to the Rural Health Unit of Bulakan on the indicated
            referral date. Present this slip or the QR code for verification.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <div className="h-12 border-b border-[#1A1A1A]" />
            <p className="mt-2 text-center text-xs text-[#6B7280]">
              Referring BHC Staff Signature
            </p>
          </div>

          <div>
            <div className="h-12 border-b border-[#1A1A1A]" />
            <p className="mt-2 text-center text-xs text-[#6B7280]">
              RHU Receiving Personnel Signature
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
        {value || "—"}
      </p>
    </div>
  );
}

