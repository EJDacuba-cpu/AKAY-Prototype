- [x] Refactor IncomingReferrals.jsx to load referrals from shared localStorage via referralService
- [x] Remove INITIAL_REFERRALS state initialization and use useEffect(getReferrals)
- [x] Persist RHU status changes via updateReferralStatus(referral.id, newStatus) and refresh

- [x] Add storage event listener + periodic polling to auto-refresh when BHC creates referrals
- [ ] Validate no UI/layout/table/tailwind changes (only data loading)

- [ ] Run frontend lint/build checks (if available)
