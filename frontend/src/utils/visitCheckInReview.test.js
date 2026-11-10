import test from 'node:test';
import assert from 'node:assert/strict';
import { visitCheckInReview } from './visitCheckInReview.js';

test('already in queue wins over referrals and follow-ups', () => {
  const review = visitCheckInReview({
    alreadyInQueue: true,
    pendingReferrals: { count: 1, referrals: [{ tracking_id: 'TRK-1', sending_bhc: 'BHC' }] },
    pendingFollowUps: { count: 1, follow_ups: [{ id: 1, due_date: '2026-11-01', state: 'pending', is_overdue: true }] },
  });
  assert.equal(review.kind, 'already_in_queue');
  assert.equal(review.statusLabel, "Already in Today's Queue");
  assert.equal(review.canConfirm, false);
});

test('loading never reports ready for check-in', () => {
  const review = visitCheckInReview({ loading: true });
  assert.equal(review.kind, 'loading');
  assert.equal(review.statusLabel, 'Checking visit records...');
  assert.equal(review.canConfirm, false);
  assert.equal(review.loading, true);
});

test('failed lookup keeps check-in blocked and exposes retry error', () => {
  const review = visitCheckInReview({ error: 'Network timeout' });
  assert.equal(review.kind, 'error');
  assert.equal(review.statusLabel, 'Visit records check failed');
  assert.equal(review.error, 'Network timeout');
  assert.equal(review.canConfirm, false);
});

test('regular patient is ready for check-in', () => {
  const review = visitCheckInReview({
    pendingReferrals: { count: 0, referrals: [] },
    pendingFollowUps: { count: 0, follow_ups: [] },
  });
  assert.equal(review.kind, 'ready');
  assert.equal(review.statusLabel, 'Ready for Check-in');
  assert.equal(review.canConfirm, true);
});

test('pending follow-up shows due date and still allows queue entry', () => {
  const review = visitCheckInReview({
    pendingReferrals: { count: 0, referrals: [] },
    pendingFollowUps: {
      count: 1,
      follow_ups: [{ id: 9, due_date: '2026-11-20', state: 'pending', is_overdue: false }],
    },
  });
  assert.equal(review.kind, 'pending_follow_up');
  assert.equal(review.statusLabel, 'Pending Follow-up');
  assert.match(review.statusDetail, /Due Nov 20, 2026/);
  assert.equal(review.canConfirm, true);
});

test('overdue follow-up uses overdue status', () => {
  const review = visitCheckInReview({
    pendingReferrals: { count: 0, referrals: [] },
    pendingFollowUps: {
      count: 1,
      follow_ups: [{ id: 3, due_date: '2026-10-01', state: 'pending', is_overdue: true }],
    },
  });
  assert.equal(review.kind, 'overdue_follow_up');
  assert.equal(review.statusLabel, 'Overdue Follow-up');
  assert.match(review.statusDetail, /Overdue/);
  assert.match(review.statusDetail, /Oct 1, 2026/);
  assert.equal(review.canConfirm, true);
});

test('pending referral blocks ordinary check-in and keeps referral links', () => {
  const review = visitCheckInReview({
    pendingReferrals: {
      count: 1,
      referrals: [{ tracking_id: 'TRK-1', sending_bhc: 'San Isidro BHC' }],
    },
    pendingFollowUps: { count: 0, follow_ups: [] },
  });
  assert.equal(review.kind, 'pending_referral');
  assert.equal(review.statusLabel, 'Pending BHC Referral');
  assert.equal(review.statusDetail, 'San Isidro BHC');
  assert.equal(review.canConfirm, false);
  assert.equal(review.referralLinks.length, 1);
  assert.equal(review.referralLinks[0].href, '/rhu/referrals/TRK-1');
});

test('referral plus follow-up prioritizes referral verification and still surfaces follow-up', () => {
  const review = visitCheckInReview({
    pendingReferrals: {
      count: 1,
      referrals: [{ tracking_id: 'TRK-2', sending_bhc: 'Poblacion BHC' }],
    },
    pendingFollowUps: {
      count: 1,
      follow_ups: [{ id: 4, due_date: '2026-11-12', state: 'pending', is_overdue: false }],
    },
  });
  assert.equal(review.kind, 'pending_referral');
  assert.equal(review.canConfirm, false);
  assert.match(review.followUpDetail, /Pending Follow-up/);
  assert.match(review.followUpDetail, /Nov 12, 2026/);
});

test('multiple follow-ups summarize without selecting one task', () => {
  const review = visitCheckInReview({
    pendingReferrals: { count: 0, referrals: [] },
    pendingFollowUps: {
      count: 2,
      follow_ups: [
        { id: 1, due_date: '2026-10-01', state: 'pending', is_overdue: true },
        { id: 2, due_date: '2026-11-15', state: 'pending', is_overdue: false },
      ],
    },
  });
  assert.equal(review.kind, 'pending_follow_up');
  assert.equal(review.statusLabel, 'Pending Follow-up');
  assert.match(review.statusDetail, /1 overdue/);
  assert.match(review.statusDetail, /1 pending/);
  assert.match(review.statusDetail, /Oct 1, 2026/);
  assert.match(review.statusDetail, /Nov 15, 2026/);
  assert.equal(review.canConfirm, true);
  assert.equal(Object.hasOwn(review, 'selectedFollowUpId'), false);
});

test('multiple pending referrals keep every tracking link', () => {
  const review = visitCheckInReview({
    pendingReferrals: {
      count: 2,
      referrals: [
        { tracking_id: 'TRK-1', sending_bhc: 'San Isidro BHC' },
        { tracking_id: 'TRK-2', sending_bhc: 'Poblacion BHC' },
      ],
    },
  });
  assert.equal(review.kind, 'pending_referral');
  assert.equal(review.statusDetail, 'San Isidro BHC and Poblacion BHC');
  assert.deepEqual(review.referralLinks.map((link) => link.trackingId), ['TRK-1', 'TRK-2']);
});
