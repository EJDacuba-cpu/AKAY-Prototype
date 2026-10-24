<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReferralVisitDeleteGuardTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private Referral $referral;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Guard RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Guard BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $patient = Patient::create(['first_name' => 'Guard', 'last_name' => 'Patient', 'sex' => 'Female', 'status' => 'active', 'barangay_health_center_id' => $bhc->id, 'rural_health_unit_id' => $this->rhu->id]);
        $this->referral = Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Guard test',
            'status' => Referral::STATUS_RECEIVED,
        ]);
        $nurse = User::create(['name' => 'Guard Nurse', 'email' => 'guard-nurse@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id]);
        Sanctum::actingAs($nurse, ['akay:access']);
    }

    private function visit(array $attributes = []): RhuVisitQueueEntry
    {
        return RhuVisitQueueEntry::create([
            'rural_health_unit_id' => $this->rhu->id,
            'patient_id' => $this->referral->patient_id,
            'referral_id' => $this->referral->id,
            'source' => RhuVisitQueueEntry::SOURCE_REFERRAL,
            'status' => RhuVisitQueueEntry::STATUS_WAITING,
            'checked_in_at' => now(),
            'check_in_key' => 'referral-'.$this->referral->id,
            ...$attributes,
        ]);
    }

    public function test_referral_with_a_visit_cannot_be_deleted(): void
    {
        $this->visit();

        $this->deleteJson("/api/referrals/{$this->referral->id}")
            ->assertConflict()
            ->assertJsonPath('code', 'REFERRAL_HAS_VISIT')
            ->assertJsonPath('message', 'This referral has a recorded RHU visit and cannot be deleted.');

        $this->assertNotNull($this->referral->fresh());
    }

    public function test_referral_with_a_closed_visit_still_cannot_be_deleted(): void
    {
        $this->visit(['closed_at' => now()]);

        $this->deleteJson("/api/referrals/{$this->referral->id}")->assertConflict();

        $this->assertNotNull($this->referral->fresh());
    }

    public function test_referral_without_a_visit_deletes_as_before(): void
    {
        $this->deleteJson("/api/referrals/{$this->referral->id}")->assertNoContent();

        $this->assertNull($this->referral->fresh());
    }

    public function test_referral_index_exists(): void
    {
        $this->assertContains(
            'rhu_visit_queue_entries_referral_idx',
            array_column(Schema::getIndexes('rhu_visit_queue_entries'), 'name')
        );
    }
}
