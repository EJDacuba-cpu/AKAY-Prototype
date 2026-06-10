import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { getReferralByTrackingId } from "../../services/referrals";
import ReferralPrintSlip from "../../components/features/referrals/ReferralPrintSlip";

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
        if (active) setReferral(found);
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
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!referral || loading}
        >
          <Printer size={16} />
          Print Slip
        </button>
      </div>

      {(loading || error || !referral) && (
        <div className="mx-auto max-w-xl rounded-xl border border-dashed border-[#E8ECF0] bg-white p-8 text-center shadow-sm">
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

      {referral && !loading && <ReferralPrintSlip referral={referral} />}
    </DashboardLayout>
  );
}
