<?php

namespace Tests\Unit\Services;

use App\Services\CarePlan;
use PHPUnit\Framework\TestCase;

class CarePlanTest extends TestCase
{
    public function test_predicates(): void
    {
        $this->assertTrue(CarePlan::refers('refer'));
        $this->assertTrue(CarePlan::refers('monitor_refer'));
        $this->assertFalse(CarePlan::refers('recheck'));
        $this->assertFalse(CarePlan::refers(null));
    }

    public function test_only_recheck_and_follow_up_keep_a_bhc_follow_up(): void
    {
        $this->assertTrue(CarePlan::keepsBhcFollowUp('recheck'));
        $this->assertTrue(CarePlan::keepsBhcFollowUp('follow_up'));
        $this->assertFalse(CarePlan::keepsBhcFollowUp('refer'));
        $this->assertFalse(CarePlan::keepsBhcFollowUp('monitor'));
        $this->assertFalse(CarePlan::keepsBhcFollowUp(null));
    }

    public function test_selectable_actions_are_none_follow_up_refer(): void
    {
        $this->assertSame(['none', 'follow_up', 'refer'], CarePlan::SELECTABLE);
        foreach (['recheck', 'monitor', 'monitor_refer'] as $legacy) {
            $this->assertContains($legacy, CarePlan::VALUES, 'stored records still read it');
            $this->assertNotContains($legacy, CarePlan::SELECTABLE);
        }
        $this->assertSame(['recheck'], CarePlan::TRANSITION_ACCEPTED);
    }

    public function test_recheck_still_keeps_a_bhc_follow_up_for_stored_records(): void
    {
        $this->assertTrue(CarePlan::keepsBhcFollowUp('recheck'));
    }

    public function test_schedules_bhc_follow_up_for_follow_up_and_flagged_refer_only(): void
    {
        $this->assertTrue(CarePlan::schedulesBhcFollowUp(['carePlan' => 'follow_up']));
        $this->assertTrue(CarePlan::schedulesBhcFollowUp(['carePlan' => 'refer', 'bhcFollowUp' => true]));
        $this->assertTrue(CarePlan::schedulesBhcFollowUp(['carePlan' => 'recheck']));
        $this->assertFalse(CarePlan::schedulesBhcFollowUp(['carePlan' => 'refer']));
        $this->assertFalse(CarePlan::schedulesBhcFollowUp(['carePlan' => 'none']));
        $this->assertFalse(CarePlan::schedulesBhcFollowUp(['carePlan' => 'none', 'bhcFollowUp' => true]));
        $this->assertFalse(CarePlan::schedulesBhcFollowUp('junk'));
    }

    public function test_normalize_transition_values_maps_recheck_and_keeps_keys(): void
    {
        $this->assertSame(
            [['id' => 'd1', 'name' => 'BP', 'carePlan' => 'follow_up', 'reportAs' => 'morbidity']],
            CarePlan::normalizeTransitionValues([['id' => 'd1', 'name' => 'BP', 'carePlan' => 'recheck', 'reportAs' => 'morbidity']])
        );
    }

    public function test_flagged_referral_keeps_the_follow_up(): void
    {
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([['name' => 'Cough', 'carePlan' => 'refer', 'bhcFollowUp' => true]], []));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral([['name' => 'Cough', 'carePlan' => 'refer']], []));
    }

    public function test_refers_any_reads_concern_entries(): void
    {
        $this->assertTrue(CarePlan::refersAny([['name' => 'A', 'carePlan' => 'recheck'], ['name' => 'B', 'carePlan' => 'refer'], 'junk']));
        $this->assertFalse(CarePlan::refersAny([['name' => 'A']]));
    }

    public function test_recheck_reason_lists_the_recheck_concerns_in_order(): void
    {
        $this->assertSame('Recheck: A; B', CarePlan::recheckReason([
            ['name' => ' A ', 'carePlan' => 'recheck'],
            ['name' => 'X', 'carePlan' => 'follow_up'],
            ['name' => 'B', 'carePlan' => 'recheck'],
            ['name' => '  ', 'carePlan' => 'recheck'],
            'junk',
        ]));
        $this->assertNull(CarePlan::recheckReason([['name' => 'X', 'carePlan' => 'follow_up'], ['name' => 'Y']]));
        $this->assertNull(CarePlan::recheckReason([]));
    }

    public function test_a_referral_keeps_the_follow_up_for_a_recheck_or_follow_up_concern_or_a_dated_service_visit(): void
    {
        $refer = [['name' => 'Pneumonia', 'carePlan' => 'refer']];

        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([...$refer, ['name' => 'Hypertension', 'carePlan' => 'recheck']], []));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([...$refer, ['name' => 'Hypertension', 'carePlan' => 'follow_up']], []));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['EPI'], 'followUpDate' => '2026-11-01']));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['Maternal'], 'follow_up_date' => '2026-11-01']));
        // Stored legacy concerns keep their follow-up too (resync of old records).
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([...$refer, ['name' => 'Hypertension', 'carePlan' => 'monitor']], []));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([['name' => 'Hypertension', 'carePlan' => 'monitor_refer']], []));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['EPI'], 'followUpDate' => null]));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => [], 'followUpDate' => '2026-11-01']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['followUpDate' => '2026-11-01']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, null));
    }

    public function test_bhc_follow_up_flag_keeps_follow_up_with_referral(): void
    {
        // v2: the visit-level Schedule BHC Follow-up flag survives a referral,
        // read strictly as the boolean the controller stores.
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral([], ['bhcFollowUp' => true]));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral([], ['bhcFollowUp' => 'true']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral([], ['bhcFollowUp' => false]));
    }
}
