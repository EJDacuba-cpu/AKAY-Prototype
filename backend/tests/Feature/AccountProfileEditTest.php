<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccountProfileEditTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $rhu = RuralHealthUnit::create(['name' => 'Edit RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Edit BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $admin = User::create(['name' => 'MHO', 'email' => 'mho@example.test', 'password' => 'password123', 'role' => 'admin', 'status' => 'active', 'permissions' => []]);
        $this->user = User::create([
            'name' => 'Old Name', 'email' => 'nurse@example.test', 'password' => bin2hex(random_bytes(16)),
            'contact_number' => '09170000000', 'role' => 'bhc', 'staff_role' => 'midwife', 'status' => 'active',
            'barangay_health_center_id' => $bhc->id, 'permissions' => [],
        ]);
        Sanctum::actingAs($admin, ['*']);
    }

    public function test_admin_edits_only_name_and_contact_number(): void
    {
        $this->user->createToken('session');
        $before = $this->user->only(['email', 'role', 'staff_role', 'status', 'barangay_health_center_id']);

        $this->patchJson("/api/users/{$this->user->id}", ['name' => 'Fixed Name', 'contact_number' => '09171234567'])
            ->assertOk();

        $fresh = $this->user->fresh();
        $this->assertSame('Fixed Name', $fresh->name);
        $this->assertSame('09171234567', $fresh->contact_number);
        $this->assertSame($before, $fresh->only(array_keys($before)));
        $this->assertSame(1, $fresh->tokens()->count());
        $this->assertTrue(AuditLog::where('module', 'users')->where('action', 'updated')->exists());
    }

    public function test_a_bad_contact_number_is_rejected(): void
    {
        $this->patchJson("/api/users/{$this->user->id}", ['contact_number' => '12345'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contact_number');
    }
}
