<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\Household;
use App\Models\Patient;
use App\Models\RhuVisitQueueEntry;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\FacilityAccessService;
use App\Services\RhuVisitQueueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class RhuWalkInRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhu;

    private BarangayHealthCenter $bhc;

    private User $registrar;

    protected function setUp(): void
    {
        parent::setUp();
        $this->rhu = RuralHealthUnit::create(['name' => 'Registration RHU', 'status' => 'active']);
        $this->bhc = BarangayHealthCenter::create(['name' => 'Registration BHC', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);
        $this->registrar = User::create(['name' => 'RHU Registrar', 'email' => 'walk-in-registrar@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'rhu', 'staff_role' => 'nurse', 'rural_health_unit_id' => $this->rhu->id, 'permissions' => ['patients.register', 'families.view', 'families.manage']]);
        Sanctum::actingAs($this->registrar, ['akay:access']);
    }

    private function registration(array $overrides = []): array
    {
        return [
            'first_name' => 'Ana',
            'last_name' => 'Cruz',
            'sex' => 'Female',
            'birthdate' => '1990-01-01',
            'household' => ['kind' => 'new', 'serial_mode' => 'auto', 'address' => ['streetAddress' => 'Main street', 'purokArea' => 'Zone 1', 'barangay' => 'Local', 'municipality' => 'Bulakan']],
            ...$overrides,
        ];
    }

    private function register(array $overrides = [])
    {
        return $this->postJson('/api/patients', $this->registration($overrides));
    }

    public function test_registration_with_check_in_creates_patient_household_and_visit(): void
    {
        $response = $this->register(['check_in' => ['key' => 'walk-in-1']])
            ->assertCreated()
            ->assertJsonPath('data.rural_health_unit_id', $this->rhu->id)
            ->assertJsonPath('visit.status', 'waiting');

        $entry = RhuVisitQueueEntry::sole();
        $this->assertSame($response->json('data.id'), $entry->patient_id);
        $this->assertSame($response->json('visit.id'), $entry->id);
        $this->assertSame('walk_in', $entry->source);
        $this->assertNull($entry->referral_id);
        $this->assertSame('walk-in-1', $entry->check_in_key);
        $this->assertNotNull($response->json('data.household_id'));
    }

    public function test_registration_without_check_in_creates_no_visit(): void
    {
        $this->register()->assertCreated()->assertJsonMissingPath('visit');

        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_failure_after_the_patient_insert_rolls_everything_back(): void
    {
        $this->app->instance(RhuVisitQueueService::class, new class(app(FacilityAccessService::class)) extends RhuVisitQueueService
        {
            protected function insert(array $attributes): RhuVisitQueueEntry
            {
                throw new RuntimeException('forced failure');
            }
        });

        $this->register(['check_in' => ['key' => 'walk-in-1']])->assertStatus(500);

        $this->assertSame(0, Patient::count());
        $this->assertSame(0, Household::count());
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_blank_or_overlong_check_in_key_is_422(): void
    {
        foreach (['', str_repeat('k', 101)] as $key) {
            $this->register(['check_in' => ['key' => $key]])->assertUnprocessable()->assertJsonValidationErrors('check_in.key');
        }

        $this->assertSame(0, Patient::count());
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_reserved_prefix_key_is_422_and_creates_no_patient(): void
    {
        $this->register(['check_in' => ['key' => 'referral-9']])->assertUnprocessable();

        $this->assertSame(0, Patient::count());
    }

    public function test_bhc_user_cannot_send_check_in(): void
    {
        $bhcUser = User::create(['name' => 'BHC Registrar', 'email' => 'walk-in-bhc@example.test', 'password' => 'password123', 'status' => 'active', 'role' => 'bhc', 'staff_role' => 'midwife', 'barangay_health_center_id' => $this->bhc->id]);
        Sanctum::actingAs($bhcUser, ['akay:access']);

        $this->register(['check_in' => ['key' => 'walk-in-1']])->assertForbidden();

        $this->assertSame(0, Patient::count());
    }

    public function test_same_name_and_birthdate_warns_and_creates_nothing(): void
    {
        $existing = Patient::create(['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);

        $this->register(['first_name' => '  ana ', 'last_name' => 'CRUZ', 'check_in' => ['key' => 'walk-in-1']])
            ->assertConflict()
            ->assertJsonPath('code', 'POSSIBLE_DUPLICATE_PATIENT')
            ->assertJsonCount(1, 'matches')
            ->assertJsonPath('matches.0.id', $existing->id)
            ->assertJsonPath('matches.0.active_visit_id', null);

        $this->assertSame(1, Patient::count());
        $this->assertSame(0, RhuVisitQueueEntry::count());
    }

    public function test_confirmed_duplicate_registers_and_enqueues(): void
    {
        Patient::create(['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);

        $this->register(['check_in' => ['key' => 'walk-in-1'], 'confirm_possible_duplicate' => true])
            ->assertCreated()
            ->assertJsonPath('visit.status', 'waiting');

        $this->assertSame(2, Patient::count());
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }

    public function test_no_warning_for_a_different_birthdate_or_without_check_in(): void
    {
        Patient::create(['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);

        $this->register(['birthdate' => '1991-02-02', 'check_in' => ['key' => 'walk-in-1']])->assertCreated();
        $this->register()->assertCreated()->assertJsonMissingPath('visit');
    }

    public function test_missing_birthdate_skips_the_duplicate_lookup(): void
    {
        Patient::create(['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => null, 'status' => 'active', 'rural_health_unit_id' => $this->rhu->id]);

        // A new household needs a dated head, so register this patient without one.
        $this->postJson('/api/patients', ['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'check_in' => ['key' => 'walk-in-1']])
            ->assertCreated()
            ->assertJsonPath('visit.status', 'waiting');
    }

    public function test_other_facility_same_name_does_not_warn(): void
    {
        Patient::create(['first_name' => 'Ana', 'last_name' => 'Cruz', 'sex' => 'Female', 'birthdate' => '1990-01-01', 'status' => 'active', 'barangay_health_center_id' => $this->bhc->id]);

        $this->register(['check_in' => ['key' => 'walk-in-1']])->assertCreated();
    }

    public function test_resubmitting_with_the_same_key_creates_no_second_patient(): void
    {
        $this->register(['check_in' => ['key' => 'walk-in-1']])->assertCreated();

        $this->register(['check_in' => ['key' => 'walk-in-1'], 'confirm_possible_duplicate' => true])
            ->assertConflict()
            ->assertJsonPath('code', 'VISIT_CHECK_IN_KEY_CONFLICT');

        $this->assertSame(1, Patient::count());
        $this->assertSame(1, RhuVisitQueueEntry::count());
    }
}
