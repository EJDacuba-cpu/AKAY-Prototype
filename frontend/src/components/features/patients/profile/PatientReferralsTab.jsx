import { Link } from "react-router";

import { RefreshingIndicator, SoftLoadingArea, FixedTable, TablePagination } from "../../../common";
import { ReferralStatusChip } from "./ProfileChip";
import usePagedRows from "../../../../hooks/usePagedRows";
import { formatDisplayValue } from "../../../../utils/formatters";
import { getReferralDate } from "./FollowUpsAndReferrals";
import { referralListKey, referredServices } from "../../../../utils/referralSlipView";
import { reviewReferralSlipPath } from "../../../../utils/rhuVisitRoutes";

export default function PatientReferralsTab({
  patientId,
  referrals = [],
  isLoading = false,
  isFetching = false,
  isError = false,
  onRetry,
}) {
  const { page, setPage, totalPages, pageRows } = usePagedRows(referrals, referrals.length);

  return (
    <section aria-label="Referrals" className="space-y-3 p-4">
      {isError && referrals.length === 0 ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-900">
          Unable to load referral history.
          <button type="button" onClick={onRetry} className="text-[13px] font-medium text-ink-700 hover:underline">
            Retry
          </button>
        </div>
      ) : isLoading && referrals.length === 0 ? (
        <SoftLoadingArea skeleton="table" bodyOnly isLoading message="Loading referrals..." minHeight="min-h-[320px]">
          <div className="min-h-[320px]" />
        </SoftLoadingArea>
      ) : (
        <>
          {isFetching && referrals.length > 0 && <RefreshingIndicator label="Updating referrals..." />}
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
            <div className="md:hidden">
              {pageRows.length === 0 ? (
                <p className="p-10 text-center text-sm text-neutral-500">No referral history found for this patient.</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {pageRows.map((referral) => (
                    <ReferralCard key={referralListKey(referral)} patientId={patientId} referral={referral} />
                  ))}
                </ul>
              )}
            </div>
            <div className="hidden md:block">
              <FixedTable minWidth="min-w-[760px]">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-[12px] font-medium text-neutral-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Date of Referral / Tracking ID</th>
                    <th scope="col" className="px-4 py-3">Referring BHC</th>
                    <th scope="col" className="px-4 py-3">Referred Concerns / Services</th>
                    <th scope="col" className="px-4 py-3">Referral Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-[13px] text-neutral-900">
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center text-neutral-500">
                        No referral history found for this patient.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((referral) => (
                      <ReferralRow key={referralListKey(referral)} patientId={patientId} referral={referral} />
                    ))
                  )}
                </tbody>
              </FixedTable>
            </div>
            {referrals.length > 0 && (
              <div className="border-t border-neutral-100">
                <TablePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function slipTo(patientId, referral) {
  return reviewReferralSlipPath(patientId, referral.id || referral.trackingId);
}

function ReferralRow({ patientId, referral }) {
  const trackingId = referral.trackingId || referral.id;
  return (
    <tr className="hover:bg-neutral-50">
      <td className="px-4 py-3">
        <p className="tabular-nums">{getReferralDate(referral)}</p>
        <p className="mt-0.5 font-mono text-[12px] text-neutral-500">{trackingId}</p>
      </td>
      <td className="px-4 py-3">{formatDisplayValue(referral.referringHci, "Not recorded")}</td>
      <td className="max-w-[240px] truncate px-4 py-3">{formatDisplayValue(referredServices(referral), "Not recorded")}</td>
      <td className="px-4 py-3">
        <ReferralStatusChip status={referral.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={slipTo(patientId, referral)}
          className="text-[13px] font-medium text-ink-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-400/50"
        >
          View Details
        </Link>
      </td>
    </tr>
  );
}

function ReferralCard({ patientId, referral }) {
  const trackingId = referral.trackingId || referral.id;
  return (
    <li className="space-y-2 p-4 text-sm text-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular-nums">{getReferralDate(referral)}</p>
          <p className="mt-0.5 font-mono text-[12px] text-neutral-500">{trackingId}</p>
        </div>
        <ReferralStatusChip status={referral.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-neutral-500">Referring BHC</dt>
        <dd className="text-right">{formatDisplayValue(referral.referringHci, "Not recorded")}</dd>
        <dt className="text-neutral-500">Referred concerns</dt>
        <dd className="text-right">{formatDisplayValue(referredServices(referral), "Not recorded")}</dd>
      </dl>
      <Link
        to={slipTo(patientId, referral)}
        className="inline-flex text-[13px] font-medium text-ink-700 hover:underline"
      >
        View Details
      </Link>
    </li>
  );
}
