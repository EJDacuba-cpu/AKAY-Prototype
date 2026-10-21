<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\HealthRecord;
use App\Models\Medicine;
use App\Models\Patient;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\MedicineStockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MedicineExpiryEligibilityTest extends TestCase
{
    use RefreshDatabase;

    private BarangayHealthCenter $bhc;

    private User $bhw;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.timezone' => 'UTC']);
        date_default_timezone_set('UTC');

        $rhu = RuralHealthUnit::create(['name' => 'Expiry RHU']);
        $this->bhc = BarangayHealthCenter::create([
            'name' => 'Expiry BHC',
            'rural_health_unit_id' => $rhu->id,
        ]);
        $this->bhw = User::create([
            'name' => 'Expiry BHW',
            'email' => 'expiry-bhw@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_BHC,
            'status' => User::STATUS_ACTIVE,
            'barangay_health_center_id' => $this->bhc->id,
            'permissions' => ['inventory.view', 'inventory.manage', 'items.dispense'],
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        date_default_timezone_set('UTC');
        parent::tearDown();
    }

    public function test_missing_expiry_is_not_treated_as_expired(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-22 00:30:00', 'Asia/Manila'));
        $medicine = $this->medicine(['expiration_date' => null]);

        $this->assertNull($medicine->expirationCalendarDate());
        $this->assertFalse($medicine->isExpiredOnFacilityCalendar());
        $this->assertFalse($medicine->expiresTodayOnFacilityCalendar());
        $this->assertSame(8, $this->dispense($medicine, 2)->fresh()->quantity);
    }

    public function test_expiry_equal_to_manila_today_is_still_dispensable(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-22 00:30:00', 'Asia/Manila'));
        $medicine = $this->medicine(['expiration_date' => '2026-10-22']);

        $this->assertTrue($medicine->expiresTodayOnFacilityCalendar());
        $this->assertFalse($medicine->isExpiredOnFacilityCalendar());
        $this->assertSame(7, $this->dispense($medicine, 3)->fresh()->quantity);
    }

    public function test_past_manila_expiry_cannot_be_dispensed_even_when_utc_date_has_not_rolled(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-23 00:30:00', 'Asia/Manila'));
        $medicine = $this->medicine(['expiration_date' => '2026-10-22']);

        $this->assertTrue($medicine->isExpiredOnFacilityCalendar());
        $this->assertFalse($medicine->expiresTodayOnFacilityCalendar());
        $this->assertSame('2026-10-22', $medicine->expirationCalendarDate());
        $this->assertSame('2026-10-23', Medicine::facilityCalendarDate());

        try {
            $this->dispense($medicine, 1);
            $this->fail('Expired stock must not be dispensable.');
        } catch (HttpResponseException $exception) {
            $this->assertSame(422, $exception->getResponse()->getStatusCode());
            $this->assertSame(
                'MEDICINE_NOT_DISPENSABLE',
                $exception->getResponse()->getData(true)['code'] ?? null
            );
        }

        $this->assertSame(10, $medicine->fresh()->quantity);
        $this->assertDatabaseCount('health_record_medicines', 0);
    }

    public function test_future_expiry_remains_dispensable(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-22 16:00:00', 'Asia/Manila'));
        $medicine = $this->medicine(['expiration_date' => '2026-11-22']);

        $this->assertFalse($medicine->isExpiredOnFacilityCalendar());
        $this->assertSame(9, $this->dispense($medicine, 1)->fresh()->quantity);
    }

    private function dispense(Medicine $medicine, int $quantity): Medicine
    {
        $patient = Patient::create([
            'first_name' => 'Expiry',
            'last_name' => 'Patient',
            'sex' => 'Female',
            'barangay_health_center_id' => $this->bhc->id,
        ]);
        $record = HealthRecord::create([
            'patient_id' => $patient->id,
            'created_by' => $this->bhw->id,
            'barangay_health_center_id' => $this->bhc->id,
            'category' => 'General Consultation',
        ]);
        $request = Request::create('/api/health-records', 'POST');
        $request->setUserResolver(fn (): User => $this->bhw);

        DB::transaction(fn () => app(MedicineStockService::class)->dispense(
            $request,
            $record,
            [['medicine_id' => $medicine->id, 'quantity' => $quantity]]
        ));

        return $medicine;
    }

    private function medicine(array $overrides = []): Medicine
    {
        return Medicine::create([
            'name' => 'Expiry Test Medicine',
            'category' => 'Basic Medicines',
            'quantity' => 10,
            'unit' => 'tablets',
            'availability_status' => 'Available',
            'barangay_health_center_id' => $this->bhc->id,
            'created_by' => $this->bhw->id,
            ...$overrides,
        ]);
    }
}
