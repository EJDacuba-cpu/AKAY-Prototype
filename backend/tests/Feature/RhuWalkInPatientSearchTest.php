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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RhuWalkInPatientSearchTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $nurse;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Search RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Search BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->nurse = User::create(['name' => 'Search Nurse', 'email' => 'search-nurse@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id]);
    }

    private function patient(string $first, string $last, array $attributes = []): Patient
    {
        return Patient::create(['first_name' => $first, 'last_name' => $last, 'sex' => 'Female', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id, ...$attributes]);
    }

    private function search(string $query, ?User $user = null)
    {
        Sanctum::actingAs($user ?? $this->nurse, ['akay:access']);

        return $this->getJson('/api/rhu-visits/patient-search?'.http_build_query(['q' => $query]));
    }

    public function test_full_name_tokens_find_the_patient(): void
    {
        $jose = $this->patient('Jose', 'Ramos');
        $this->patient('Maria', 'Santos');

        $this->search('Jose Ramos')->assertOk()->assertJsonPath('data.*.id', [$jose->id]);
        $this->search('ramos jose')->assertOk()->assertJsonPath('data.*.id', [$jose->id]);
    }

    public function test_matches_philhealth_and_contact_numbers(): void
    {
        $byPhilhealth = $this->patient('Phil', 'Health', ['philhealth_number' => '12-345678901-2']);
        $byContact = $this->patient('Con', 'Tact', ['contact_number' => '09171234567']);

        $this->search('12-345678901-2')->assertJsonPath('data.*.id', [$byPhilhealth->id]);
        $this->search('09171234567')->assertJsonPath('data.*.id', [$byContact->id]);
    }

    public function test_every_token_must_match(): void
    {
        $this->patient('Jose', 'Ramos');

        $this->search('Jose Santos')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_empty_or_blank_query_returns_an_empty_list(): void
    {
        $this->patient('Jose', 'Ramos');

        $this->search('')->assertOk()->assertJsonCount(0, 'data');
        $this->search('   ')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_like_wildcards_match_literally(): void
    {
        $this->patient('Maria', 'Cruz');
        $literal = $this->patient('Ma_ia', 'Cruz');

        $this->search('Ma_ia')->assertJsonPath('data.*.id', [$literal->id]);
        $this->search('%')->assertJsonCount(0, 'data');
    }

    public function test_search_ignores_case_including_accented_letters(): void
    {
        $nino = $this->patient('Niño', 'Reyes');

        // PostgreSQL LIKE is case-sensitive, so the match must not depend on the driver.
        $this->search('NIÑO REYES')->assertOk()->assertJsonPath('data.*.id', [$nino->id]);
        $this->search('niño')->assertJsonPath('data.*.id', [$nino->id]);
    }

    public function test_escape_characters_in_the_query_match_literally(): void
    {
        $bang = $this->patient('Wow!', 'Wow');
        $this->patient('Wowza', 'Wow');

        $this->search('Wow!')->assertJsonPath('data.*.id', [$bang->id]);
        $this->search('\\')->assertOk()->assertJsonCount(0, 'data');
        $this->search('!')->assertJsonPath('data.*.id', [$bang->id]);
    }

    public function test_invalid_or_oversized_query_is_a_validation_error(): void
    {
        Sanctum::actingAs($this->nurse, ['akay:access']);

        $this->getJson('/api/rhu-visits/patient-search?q[]=x')->assertUnprocessable()->assertJsonValidationErrors('q');
        $this->getJson('/api/rhu-visits/patient-search?q='.str_repeat('a', 101))->assertUnprocessable()->assertJsonValidationErrors('q');
    }

    public function test_scope_and_status(): void
    {
        $own = $this->patient('Scope', 'Own');
        $this->patient('Scope', 'Inactive', ['status' => 'inactive']);
        $otherRhu = RuralHealthUnit::create(['name' => 'Other Search RHU', 'status' => 'active']);
        $this->patient('Scope', 'Elsewhere', ['rural_health_unit_id' => $otherRhu->id]);
        $referred = $this->patient('Scope', 'Referred', ['rural_health_unit_id' => null, 'barangay_health_center_id' => $this->bhc->id]);
        Referral::create([
            'tracking_id' => 'AKY-TEST-'.uniqid(),
            'qr_code_value' => app(ReferralService::class)->makeLegacyQrPlaceholder(),
            'patient_id' => $referred->id,
            'barangay_health_center_id' => $this->bhc->id,
            'rural_health_unit_id' => $this->rhu->id,
            'reason_for_referral' => 'Scope',
            'status' => Referral::STATUS_PENDING,
        ]);
        $this->patient('Scope', 'Unreferred', ['rural_health_unit_id' => null, 'barangay_health_center_id' => $this->bhc->id]);

        $this->search('Scope')->assertOk()->assertJsonPath('data.*.id', [$own->id, $referred->id]);
    }

    public function test_result_limit_is_ten(): void
    {
        $ids = [];
        foreach (range(1, 12) as $number) {
            $ids[] = $this->patient('Limit', 'Patient'.$number)->id;
        }

        $this->search('Limit')->assertJsonCount(10, 'data')->assertJsonPath('data.0.id', $ids[0])->assertJsonPath('data.9.id', $ids[9]);
    }

    public function test_active_visit_id_is_set_for_queued_patients(): void
    {
        $queued = $this->patient('Queue', 'Ed');
        $free = $this->patient('Queue', 'Free');
        $visit = RhuVisitQueueEntry::create(['rural_health_unit_id' => $this->rhu->id, 'patient_id' => $queued->id, 'source' => 'walk_in', 'status' => 'waiting', 'checked_in_at' => now(), 'check_in_key' => 'search-key']);

        $this->search('Queue')->assertOk()
            ->assertJsonPath('data.0.id', $queued->id)
            ->assertJsonPath('data.0.active_visit_id', $visit->id)
            ->assertJsonPath('data.1.id', $free->id)
            ->assertJsonPath('data.1.active_visit_id', null);
    }

    public function test_payload_has_identity_only_and_access_is_limited(): void
    {
        $this->patient('Identity', 'Only', ['medical_background' => ['allergies' => ['items' => [['allergen' => 'Private']]]]]);

        $response = $this->search('Identity')->assertOk()->assertJsonMissingPath('data.0.medical_background');
        $this->assertStringNotContainsString('Private', $response->getContent());

        $bhcUser = User::create(['name' => 'BHC', 'email' => 'search-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
        $admin = User::create(['name' => 'Admin', 'email' => 'search-admin@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'admin']);
        $clinicalOnly = User::create(['name' => 'Reader', 'email' => 'search-reader@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => ['clinical.history']]);
        foreach ([$bhcUser, $admin, $clinicalOnly] as $user) {
            $this->search('Identity', $user)->assertForbidden();
        }
    }
}
