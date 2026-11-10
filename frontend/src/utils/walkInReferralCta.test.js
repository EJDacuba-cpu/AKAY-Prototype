import test from 'node:test';
import assert from 'node:assert/strict';
import { walkInReferralCta } from './walkInReferralCta.js';

const VERIFY = 'Arrival must be verified via Incoming Referrals.';

test('no pending referrals leaves Add to Today\'s Queue available', () => {
  for (const pending of [null, undefined, {}, { count: 0, referrals: [] }, { count: 0 }]) {
    const cta = walkInReferralCta(pending);
    assert.equal(cta.blocked, false);
    assert.deepEqual(cta.links, []);
    assert.equal(cta.statusLabel, 'Ready for Check-in');
  }
});

test('one pending referral names the BHC and links to that referral', () => {
  const cta = walkInReferralCta({
    count: 1,
    referrals: [{ referral_id: 4, tracking_id: 'TRK-1', status: 'Pending', sending_bhc: 'San Isidro BHC', referred_at: '2026-11-05' }],
  });

  assert.equal(cta.blocked, true);
  assert.equal(cta.title, 'Pending BHC Referral');
  assert.equal(cta.statusLabel, 'Pending BHC Referral');
  assert.equal(
    cta.body,
    `This patient was referred by San Isidro BHC (TRK-1). ${VERIFY}`,
  );
  assert.deepEqual(cta.links, [{
    trackingId: 'TRK-1',
    sendingBhc: 'San Isidro BHC',
    href: '/rhu/referrals/TRK-1',
    label: 'View Incoming Referral',
  }]);
});

test('a tracking id is encoded in the detail path', () => {
  const cta = walkInReferralCta({
    count: 1,
    referrals: [{ tracking_id: 'AKY/1 2', sending_bhc: 'Poblacion BHC' }],
  });

  assert.equal(cta.links[0].href, '/rhu/referrals/AKY%2F1%202');
  assert.equal(cta.links[0].href.includes('/rhu/incoming-referrals'), false);
});

test('multiple pending referrals each keep their own link, oldest order preserved', () => {
  const cta = walkInReferralCta({
    count: 2,
    referrals: [
      { tracking_id: 'TRK-1', sending_bhc: 'San Isidro BHC' },
      { tracking_id: 'TRK-2', sending_bhc: 'Poblacion BHC' },
    ],
  });

  assert.equal(cta.blocked, true);
  assert.equal(
    cta.body,
    `This patient has pending referrals from San Isidro BHC and Poblacion BHC. ${VERIFY}`,
  );
  assert.deepEqual(cta.links.map((link) => link.trackingId), ['TRK-1', 'TRK-2']);
  assert.deepEqual(cta.links.map((link) => link.sendingBhc), ['San Isidro BHC', 'Poblacion BHC']);
  assert.deepEqual(
    cta.links.map((link) => link.href),
    ['/rhu/referrals/TRK-1', '/rhu/referrals/TRK-2'],
  );
  assert.equal(cta.links.every((link) => link.label === 'View Incoming Referral'), true);
  assert.equal(cta.links.some((link) => link.href === '/rhu/incoming-referrals'), false);
});

test('the same referring BHC is named once while every tracking id stays listed', () => {
  const cta = walkInReferralCta({
    count: 2,
    referrals: [
      { tracking_id: 'TRK-1', sending_bhc: 'San Isidro BHC' },
      { tracking_id: 'TRK-2', sending_bhc: 'San Isidro BHC' },
    ],
  });

  assert.equal(
    cta.body,
    `This patient has pending referrals from San Isidro BHC. ${VERIFY}`,
  );
  assert.deepEqual(cta.links.map((link) => link.trackingId), ['TRK-1', 'TRK-2']);
});

test('a positive count with no rows still blocks confirm and does not invent a link', () => {
  const cta = walkInReferralCta({ count: 1, referrals: [] });
  assert.equal(cta.blocked, true);
  assert.equal(cta.title, 'Pending BHC Referral');
  assert.match(cta.body, /pending BHC referral/i);
  assert.match(cta.body, /Incoming Referrals/);
  assert.deepEqual(cta.links, []);
});

test('a missing BHC name still blocks and still links the tracking id', () => {
  const cta = walkInReferralCta({
    count: 1,
    referrals: [{ tracking_id: 'TRK-9', sending_bhc: '  ' }],
  });
  assert.equal(cta.blocked, true);
  assert.match(cta.body, /pending BHC referral \(TRK-9\)/);
  assert.equal(cta.links[0].sendingBhc, 'Referring BHC');
  assert.equal(cta.links[0].href, '/rhu/referrals/TRK-9');
});
