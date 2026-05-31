import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  ClipboardList,
  Download,
  Printer,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "../../components/layout/DashboardLayout";

const referrals = [
  {
    trackingId: "AKY-2026-001",
    patient: "Juan Reyes",
    category: "B1",
    priority: "Medium",
    status: "Pending",
    dateSubmitted: "May 13, 2026",
  },
  {
    trackingId: "AKY-2026-002",
    patient: "Maria Rosa",
    category: "C2",
    priority: "High",
    status: "Received",
    dateSubmitted: "May 13, 2026",
  },
  {
    trackingId: "AKY-2026-003",
    patient: "John Cruz",
    category: "A1",
    priority: "Normal",
    status: "Completed",
    dateSubmitted: "May 12, 2026",
  },
  {
    trackingId: "AKY-2026-004",
    patient: "David Perez",
    category: "A2",
    priority: "Normal",
    status: "Completed",
    dateSubmitted: "May 12, 2026",
  },
  {
    trackingId: "AKY-2026-005",
    patient: "Antonio Santos",
    category: "B1",
    priority: "Medium",
    status: "For Monitoring",
    dateSubmitted: "May 11, 2026",
  },
];

const qrCells = [
  1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0,
  1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1,
  1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0,
  1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1,
  0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1,
  0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1,
];

export default function ReferralQRCode() {
  const { trackingId } = useParams();

  const referral = referrals.find((item) => item.trackingId === trackingId);

  if (!referral) {
    return (
      <DashboardLayout role="bhc" title="Referral QR Code">
        <div className="rounded-xl border border-[#E8ECF0] bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-[#0F172A]">
            QR code not found
          </h1>
          <p className="mt-2 text-sm text-[#6B7280]">
            No referral record is connected to this tracking ID.
          </p>

          <Link
            to="/bhc/referrals"
            className="mt-5 inline-flex rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#991B1B]"
          >
            Back to Referrals
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="bhc" title="Referral QR Code">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .anim-fade-up {
          animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div className="anim-fade-up mb-8">
        <Link
          to="/bhc/referrals"
          className="mb-4 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0F172A] transition-all hover:gap-2.5 hover:text-[#991B1B]"
        >
          <ArrowLeft size={16} />
          Back to Referrals
        </Link>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#B91C1C] text-white shadow-md shadow-[#B91C1C]/20">
              <QrCode size={24} />
            </div>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
                Referral QR Code
              </h1>
              <p className="mt-1 text-sm text-[#6B7280]">
                {referral.trackingId} · {referral.patient}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-[#E8ECF0] bg-white px-4 py-2 text-xs font-semibold text-[#0F172A] hover:bg-[#F8FAFC]">
              <Printer size={14} />
              Print
            </button>

            <button className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#991B1B]">
              <Download size={14} />
              Download
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-[#E8ECF0] bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto rounded-2xl border border-[#E8ECF0] bg-[#FAFBFC] p-6">
              <div className="mx-auto grid h-64 w-64 grid-cols-12 gap-1 rounded-xl bg-white p-4 shadow-sm">
                {qrCells.map((cell, index) => (
                  <div
                    key={index}
                    className={`rounded-[2px] ${
                      cell ? "bg-[#B91C1C]" : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>

            <p className="mt-5 font-mono text-sm font-bold text-[#0F172A]">
              {referral.trackingId}
            </p>

            <p className="mt-2 text-sm text-[#6B7280]">
              QR code represents the referral tracking ID used by RHU staff for
              quick retrieval.
            </p>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-[#E8ECF0] bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEF2F2] text-[#B91C1C]">
                <ClipboardList size={15} />
              </div>

              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Referral Details
                </h2>
                <p className="text-xs text-[#9CA3AF]">
                  Information connected to this QR code.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <DetailItem label="Patient" value={referral.patient} />
              <DetailItem label="Tracking ID" value={referral.trackingId} />
              <DetailItem label="Category" value={referral.category} />
              <DetailItem label="Priority" value={referral.priority} />
              <DetailItem label="Status" value={referral.status} />
              <DetailItem
                label="Date Submitted"
                value={referral.dateSubmitted}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <ShieldCheck size={14} />
              </div>

              <p className="text-xs leading-relaxed text-[#4B5563]">
                The QR code helps RHU staff quickly retrieve the referral record
                using the generated tracking ID. This supports faster receiving
                and reduces manual searching.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </DashboardLayout>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 text-[13px] font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  );
}

