<?php

namespace Tests\Feature;

use App\Models\BarangayHealthCenter;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ActionPermissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestTraceTest extends TestCase
{
    use RefreshDatabase;

    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->logPath = storage_path('logs/request-trace-test-'.getmypid().'.log');
        @unlink($this->logPath);
        config(['logging.channels.request_trace.path' => $this->logPath]);

        $rhu = RuralHealthUnit::create(['name' => 'Trace RHU', 'status' => 'active']);
        $bhc = BarangayHealthCenter::create(['name' => 'Trace BHC', 'status' => 'active', 'rural_health_unit_id' => $rhu->id]);
        $user = User::create(['name' => 'Trace BHW', 'email' => 'trace@example.test', 'password' => bcrypt('test-password'), 'role' => User::ROLE_BHW, 'status' => User::STATUS_ACTIVE, 'barangay_health_center_id' => $bhc->id, 'permissions' => ActionPermissions::PRESETS['clinical']]);
        $this->actingAs($user, 'sanctum');
    }

    protected function tearDown(): void
    {
        @unlink($this->logPath);
        parent::tearDown();
    }

    public function test_traces_request_and_queries_without_patient_data_when_enabled_locally(): void
    {
        $this->app['env'] = 'local';
        config(['operations.request_trace.enabled' => true]);

        $this->getJson('/api/patients?search=Juana%20Dela%20Cruz')->assertOk();

        $log = (string) @file_get_contents($this->logPath);
        $this->assertStringContainsString('request start {"method":"GET","path":"/api/patients"}', $log);
        $this->assertStringContainsString('query #1 start', $log);
        $this->assertStringContainsString('query #1 done', $log);
        $this->assertMatchesRegularExpression('/request done \{"status":200,"ms":[\d.]+,"queries":[1-9]\d*,/', $log);
        $this->assertStringNotContainsString('Juana', $log);
    }

    public function test_writes_nothing_when_disabled(): void
    {
        $this->app['env'] = 'local';
        config(['operations.request_trace.enabled' => false]);

        $this->getJson('/api/patients')->assertOk();

        $this->assertFileDoesNotExist($this->logPath);
    }

    public function test_writes_nothing_outside_local_even_when_enabled(): void
    {
        config(['operations.request_trace.enabled' => true]);

        $this->getJson('/api/patients')->assertOk();

        $this->assertFileDoesNotExist($this->logPath);
    }
}
