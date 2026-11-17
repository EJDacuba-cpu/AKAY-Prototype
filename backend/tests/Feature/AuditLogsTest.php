<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

class AuditLogsTest extends TestCase
{
    use RefreshDatabase;

    private function account(string $role = 'admin', ?string $staff = null): User
    {
        $rhu = RuralHealthUnit::firstOrCreate(['name' => 'Audit RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::firstOrCreate(['name' => 'Audit BHC', 'rural_health_unit_id' => $rhu->id, 'status' => 'active']);

        return User::create([
            'name' => 'Audit '.($staff ?? $role), 'email' => uniqid().'@example.test',
            'password' => 'Password123', 'role' => $role, 'staff_role' => $staff, 'status' => 'active',
            'rural_health_unit_id' => $role === 'rhu' ? $rhu->id : null,
            'barangay_health_center_id' => $role === 'bhc' ? $bhc->id : null,
        ]);
    }

    public function test_explicit_multi_account_logins_and_logouts_have_correct_actors(): void
    {
        $accounts = [$this->account(), $this->account('rhu', 'doctor'), $this->account('rhu', 'intake_staff'), $this->account('bhc', 'midwife')];
        foreach ($accounts as $user) {
            $this->app['auth']->forgetGuards();
            $this->flushHeaders();
            $login = $this->postJson('/api/auth/login', $this->withTurnstile([
                'email' => $user->email, 'password' => 'Password123',
            ]))->assertOk();
            $this->assertDatabaseHas('audit_logs', ['action' => 'login', 'user_id' => $user->id]);
            $this->app['auth']->forgetGuards();
            $this->withToken($login->json('token'))->postJson('/api/auth/logout')->assertOk();
            $this->assertDatabaseHas('audit_logs', ['action' => 'logout', 'user_id' => $user->id]);
        }
        $this->assertSame(4, AuditLog::where('action', 'login')->count());
        $this->assertSame(0, AuditLog::whereNull('user_id')->count());
        Sanctum::actingAs($accounts[0], ['akay:access']);
        $rows = $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('total', 8)->json('data');
        foreach ($accounts as $user) {
            $row = collect($rows)->first(fn ($row) => $row['user_id'] === $user->id && $row['action'] === 'login');
            $this->assertSame($user->name, $row['actor_name']);
            $this->assertSame($user->staff_role, $row['user']['staff_role']);
        }
        $this->assertStringNotContainsString('Password123', json_encode($rows));
        $this->assertStringNotContainsString($login->json('token'), json_encode($rows));
    }

    public function test_labels_filters_search_and_stable_pagination_preserve_raw_history(): void
    {
        $admin = $this->account();
        $doctor = $this->account('rhu', 'doctor');
        $this->freezeTime();
        for ($i = 0; $i < 12; $i++) {
            AuditLog::create(['action' => 'draft_updated', 'module' => 'health_record_drafts', 'user_id' => $doctor->id, 'description' => 'draft_public_id=private-uuid; owner_user_id=42']);
        }
        $medicine = AuditLog::create(['action' => 'medicine_dispensed', 'module' => 'medicines', 'user_id' => $admin->id]);
        $legacy = AuditLog::create(['action' => 'login', 'module' => 'auth']);
        Sanctum::actingAs($admin, ['akay:access']);
        $before = AuditLog::orderBy('id')->get()->toArray();
        $page1 = $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('total', 14)
            ->assertJsonPath('data.0.actor_name', 'Not recorded')->assertJsonPath('data.0.role_label', 'Not recorded')
            ->assertHeader('Cache-Control', 'no-store, private')->json();
        $page2 = $this->getJson('/api/audit-logs?page=2')->assertOk()->json();
        $ids = array_column([...$page1['data'], ...$page2['data']], 'id');
        $this->assertSame(AuditLog::orderByDesc('id')->pluck('id')->all(), $ids);
        $this->assertContains('Medicine and Supply', $page2['filter_options']['modules']);
        foreach (['Consultation Draft Updated', 'consultations', 'draft_updated', 'DOCTOR', 'private-uuid'] as $search) {
            $this->getJson('/api/audit-logs?'.http_build_query(['search' => $search]))->assertOk()->assertJsonPath('total', 12);
        }
        $this->getJson('/api/audit-logs?type=Consultations&role=Doctor&module=Consultations')
            ->assertOk()->assertJsonPath('total', 12)->assertJsonPath('data.0.category', 'Consultations')
            ->assertJsonPath('data.0.role_label', 'RHU · Doctor')
            ->assertJsonPath('data.0.summary', "Updated a patient's consultation draft.")
            ->assertJsonPath('data.0.description', 'draft_public_id=private-uuid; owner_user_id=42');
        $this->getJson('/api/audit-logs?type=Account')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/audit-logs?module=medicines')->assertOk()->assertJsonPath('data.0.id', $medicine->id);
        $this->getJson('/api/audit-logs?search=LOG-'.str_pad($legacy->id, 3, '0', STR_PAD_LEFT))->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/audit-logs?search=zz-no-match')->assertOk()->assertJsonPath('total', 0);
        $this->assertSame($before, AuditLog::orderBy('id')->get()->toArray());
        AuditLog::create(['action' => 'new_custom_event', 'module' => 'new_module']);
        $this->getJson('/api/audit-logs?search=New%20Custom%20Event')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('total', 15);
    }

    public function test_audit_routes_remain_admin_only(): void
    {
        $this->getJson('/api/audit-logs')->assertUnauthorized();
        foreach (['bhc', 'rhu'] as $role) {
            Sanctum::actingAs($this->account($role), ['akay:access']);
            $this->getJson('/api/audit-logs')->assertForbidden();
        }
    }

    public function test_patient_registration_and_update_are_visible_with_the_correct_actor(): void
    {
        $user = $this->account('bhc', 'midwife');
        Sanctum::actingAs($user, ['akay:access']);
        $id = $this->postJson('/api/patients', ['first_name' => 'Audit', 'last_name' => 'Patient', 'sex' => 'Female'])
            ->assertCreated()->json('data.id');
        $this->patchJson('/api/patients/'.$id, ['last_name' => 'Updated'])->assertOk();
        foreach (['created', 'updated'] as $action) {
            $this->assertDatabaseHas('audit_logs', ['module' => 'patients', 'action' => $action, 'user_id' => $user->id]);
        }
        Sanctum::actingAs($this->account(), ['akay:access']);
        $this->getJson('/api/audit-logs?type=Patient%20Management')->assertOk()->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.action_label', 'Patient Information Updated')
            ->assertJsonPath('data.0.actor_name', $user->name);
    }

    public function test_audit_timestamp_comes_from_the_backend_and_is_serialized_with_an_offset(): void
    {
        $actor = $this->account();
        $instant = \Carbon\CarbonImmutable::parse('2026-11-17T06:30:00Z')->setTimezone(config('app.timezone'));
        $this->travelTo($instant);
        $request = Request::create('/api/auth/login', 'POST', ['created_at' => '2000-01-01']);
        app(AuditLogger::class)->log($request, 'login', 'auth', null, $actor);
        Sanctum::actingAs($actor, ['akay:access']);
        $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('data.0.created_at', '2026-11-17T06:30:00.000000Z');
    }

    public function test_known_system_events_and_handoff_results_have_honest_searchable_labels(): void
    {
        Sanctum::actingAs($this->account(), ['akay:access']);
        AuditLog::create(['action' => 'draft_expired', 'module' => 'health_record_drafts']);
        $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('data.0.actor_name', 'System');
        AuditLog::create(['action' => 'updated', 'module' => 'monitoring_handoff_requests', 'description' => 'Accepted monitoring handoff 123.']);
        $this->getJson('/api/audit-logs?search=Monitoring%20Handoff%20Accepted')->assertOk()
            ->assertJsonPath('total', 1)->assertJsonPath('data.0.summary', 'Accepted a patient monitoring handoff.');
    }

    public function test_login_rolls_back_session_creation_when_audit_storage_fails(): void
    {
        $user = $this->account();
        $this->mock(AuditLogger::class)->shouldReceive('log')->once()->andThrow(new RuntimeException('Storage unavailable'));
        $this->postJson('/api/auth/login', $this->withTurnstile([
            'email' => $user->email, 'password' => 'Password123',
        ]))->assertStatus(500);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_logger_keeps_existing_calls_and_explicit_actor_overrides_request_actor(): void
    {
        $admin = $this->account();
        $doctor = $this->account('rhu', 'doctor');
        $request = Request::create('/api/auth/login', 'POST');
        $request->setUserResolver(fn () => $admin);
        $logger = app(AuditLogger::class);
        $logger->log($request, 'login', 'auth', 'Signed in.', $doctor);
        $logger->log($request, 'logout', 'auth');
        $this->assertDatabaseHas('audit_logs', ['action' => 'login', 'user_id' => $doctor->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'logout', 'user_id' => $admin->id]);
    }

    public function test_failed_audit_writes_are_reported_and_rethrown_without_request_secrets(): void
    {
        Log::spy();
        AuditLog::creating(fn () => throw new RuntimeException('Simulated storage failure'));
        $request = Request::create('/api/auth/login', 'POST', ['password' => 'Secret123', 'token' => 'secret-token']);
        try {
            app(AuditLogger::class)->log($request, 'login', 'auth');
            $this->fail('Audit failures must propagate.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Simulated storage failure', $exception->getMessage());
        }
        Log::shouldHaveReceived('error')->once()->with('Audit record could not be persisted.', [
            'action' => 'login', 'module' => 'auth', 'actor_id' => null, 'exception_type' => RuntimeException::class,
        ]);
    }
}
