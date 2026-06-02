import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer, QrCode } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getReferralByTrackingId } from "../../services/referrals";

export default function PrintableReferralSlip() {
  const { trackingId: routeTrackingId } = useParams();
  const [searchParams] = useSearchParams();
  const trackingId = routeTrackingId || searchParams.get("trackingId") || "";
  const [referral, setReferral] = useState(null);
  const [loading, setLoading] = useState(Boolean(trackingId));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadReferral() {
      if (!trackingId) {
        setReferral(null);
        setLoading(false);
        setError("Select a referral before printing a slip.");
        return;
      }

      try {
        setLoading(true);
        setError("");
        const found = await getReferralByTrackingId(trackingId);
        if (!active) return;
        setReferral(found);
      } catch (err) {
        if (!active) return;
        setReferral(null);
        setError(err?.message || "Referral was not found.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReferral();

    return () => {
      active = false;
    };
  }, [trackingId]);

  const printableReferral = useMemo(
    () => (referral ? normalizePrintableReferral(referral) : null),
    [referral],
  );

  function handlePrint() {
    window.print();
  }

  return (
    <DashboardLayout role="bhc" title="Printable Referral Slip">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          to="/bhc/referrals"
          className="flex items-center gap-2 text-sm font-semibold text-[#B91C1C] hover:text-[#7F1D1D] hover:underline"
        >
          <ArrowLeft size={16} />
          Back to Referrals
        </Link>

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#991B1B]"
          disabled={!printableReferral || loading}
        >
          <Printer size={16} />
          Print Slip
        </button>
      </div>

      {(loading || error || !printableReferral) && (
        <div className="mx-auto max-w-4xl rounded-xl border border-dashed border-[#E8ECF0] bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-bold text-[#0F172A]">
            {loading ? "Loading referral slip..." : "No referral slip available"}
          </p>
          {!loading && (
            <p className="mt-2 text-sm text-[#6B7280]">
              {error ||
                "Referral data will appear here after it is loaded from the API."}
            </p>
          )}
        </div>
      )}

      {printableReferral && !loading && (
        <div className="mx-auto max-w-4xl rounded-xl border border-[#E8ECF0] bg-white p-8 shadow-sm print:border-0 print:shadow-none">
          <div className="border-b border-[#E8ECF0] pb-5 text-center">
            <h1 className="text-2xl font-bold text-[#0F172A]">AKAY</h1>
            <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
              Healthcare Coordination and Patient Monitoring System
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              Barangay Health Center to Rural Health Unit Referral Slip
            </p>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_160px]">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Referral Information
              </h2>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Info label="Tracking ID" value={printableReferral.trackingId} />
                <Info
                  label="Referral Category"
                  value={printableReferral.referralCategory}
                />
                <Info
                  label="Priority Level"
                  value={printableReferral.priority}
                />
                <Info
                  label="Referral Date"
                  value={printableReferral.referralDate}
                />
                <Info
                  label="Referral Time"
                  value={printableReferral.referralTime}
                />
                <Info label="Status" value={printableReferral.status} />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#B91C1C] bg-red-50/60 p-4 text-[#B91C1C]">
              <QrCode size={82} />
              <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-wide">
                QR Verification
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
            <h2 className="text-sm font-bold text-[#0F172A]">
              Patient Information
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info label="Patient Name" value={printableReferral.patientName} />
              <Info label="Age/Sex" value={printableReferral.ageSex} />
              <Info
                label="Chief Complaint"
                value={printableReferral.chiefComplaint}
              />
              <Info
                label="Reason for Referral"
                value={printableReferral.reasonForReferral}
              />
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
            <h2 className="text-sm font-bold text-[#0F172A]">
              Referring Facility
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info
                label="Referring BHC"
                value={printableReferral.referringBHC}
              />
              <Info
                label="Referring Practitioner"
                value={printableReferral.referringPractitioner}
              />
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-[#F8FAFC] p-5">
            <h2 className="text-sm font-bold text-[#0F172A]">
              RHU Destination
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info
                label="RHU Destination"
                value={printableReferral.rhuDestination}
              />
              <Info label="RHU Location" value={printableReferral.rhuLocation} />
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-red-100 bg-red-50/70 p-5">
            <p className="text-sm font-semibold text-[#0F172A]">Reminder</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              Please proceed to the assigned Rural Health Unit on the indicated
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
      )}
    </DashboardLayout>
  );
}

function normalizePrintableReferral(referral = {}) {
  const patient = referral.patient || {};
  const dateValue =
    referral.referralDateTime || referral.referral_datetime || referral.date;
  const date = dateValue ? new Date(dateValue) : null;
  const hasDate = date && !Number.isNaN(date.getTime());

  return {
    trackingId: referral.trackingId || referral.tracking_id,
    patientName:
      referral.patientName ||
      patient.fullName ||
      patient.name ||
      [patient.first_name, patient.middle_name, patient.last_name]
        .filter(Boolean)
        .join(" "),
    ageSex: [patient.age ? `${patient.age}` : "", patient.sex || referral.sex]
      .filter(Boolean)
      .join("/"),
    referralCategory: referral.referralCategory || referral.category,
    priority: referral.priority || referral.urgencyLevel,
    referringBHC:
      referral.referringHci ||
      referral.barangay_health_center?.name ||
      referral.barangayHealthCenter?.name,
    referringPractitioner: referral.referringPractitioner,
    rhuDestination:
      referral.receivingFacility ||
      referral.rural_health_unit?.name ||
      referral.ruralHealthUnit?.name,
    rhuLocation:
      referral.rural_health_unit?.municipality ||
      referral.ruralHealthUnit?.municipality ||
      referral.rhuLocation,
    referralDate: hasDate
      ? date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "",
    referralTime: hasDate
      ? date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      : "",
    status: referral.status || "Pending",
    chiefComplaint: referral.chiefComplaint,
    reasonForReferral: referral.reasonForReferral,
  };
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#1A1A1A]">
        {value || "N/A"}
      </p>
    </div>
  );
}
