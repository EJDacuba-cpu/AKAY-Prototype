<?php

namespace Tests\Unit\Services;

use App\Services\CarePlan;
use PHPUnit\Framework\TestCase;

class CarePlanTest extends TestCase
{
    public function test_predicates(): void
    {
        $this->assertTrue(CarePlan::monitors('monitor'));
        $this->assertTrue(CarePlan::monitors('monitor_refer'));
        $this->assertFalse(CarePlan::monitors('refer'));
        $this->assertFalse(CarePlan::monitors(null));
        $this->assertTrue(CarePlan::refers('refer'));
        $this->assertTrue(CarePlan::refers('monitor_refer'));
        $this->assertFalse(CarePlan::refers('none'));
    }

    public function test_any_helpers_read_diagnosis_entries(): void
    {
        $diagnoses = [['name' => 'A', 'carePlan' => 'none'], ['name' => 'B', 'carePlan' => 'monitor_refer'], 'junk'];
        $this->assertTrue(CarePlan::monitorsAny($diagnoses));
        $this->assertTrue(CarePlan::refersAny($diagnoses));
        $this->assertFalse(CarePlan::monitorsAny([['name' => 'A']]));
    }

    public function test_a_referral_keeps_the_follow_up_when_monitoring_or_a_dated_service_visit(): void
    {
        $refer = [['name' => 'Pneumonia', 'carePlan' => 'refer']];
        $monitorRefer = [['name' => 'Hypertension', 'carePlan' => 'monitor_refer']];

        $this->assertTrue(CarePlan::keepsFollowUpWithReferral($monitorRefer, []));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['EPI'], 'followUpDate' => '2026-11-01']));
        $this->assertTrue(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['Maternal'], 'follow_up_date' => '2026-11-01']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => ['EPI'], 'followUpDate' => null]));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['selectedPrograms' => [], 'followUpDate' => '2026-11-01']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, ['followUpDate' => '2026-11-01']));
        $this->assertFalse(CarePlan::keepsFollowUpWithReferral($refer, null));
    }
}
