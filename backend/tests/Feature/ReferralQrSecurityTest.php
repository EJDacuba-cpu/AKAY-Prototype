<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\BarangayHealthCenter;
use App\Models\Patient;
use App\Models\Referral;
use App\Models\RuralHealthUnit;
use App\Models\User;
use App\Services\ReferralQrService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReferralQrSecurityTest extends TestCase
{
    use RefreshDatabase;

    private RuralHealthUnit $rhuA;
    private RuralHealthUnit $rhuB;
    private BarangayHealthCenter $bhcA;
    private BarangayHealthCenter $bhcB;
    private User $bhwA;
    private User $bhwB;
    private User $rhuStaffA;
    private User $rhuStaffB;
    private Patient $patientA;
    private Referral $referralA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rhuA = RuralHealthUnit::create(['name' => 'QR Security RHU A']);
        $this->rhuB = RuralHealthUnit::create(['name' => 'QR Security RHU B']);
        $this->bhcA = BarangayHealthCenter::create([
            'name' => 'QR Security BHC A',
            'rural_health_unit_id' => $this->rhuA->id,
        ]);
        $this->bhcB = BarangayHealthCenter::create([
            'name' => 'QR Security BHC B',
            'rural_health_unit_id' => $this->rhuB->id,
        ]);
        $this->bhwA = $this->user('QR BHW A', 'qr-bhw-a@example.test', User::ROLE_BHW, $this->bhcA->id);
        $this->bhwB = $this->user('QR BHW B', 'qr-bhw-b@example.test', User::ROLE_BHW, $this->bhcB->id);
        $this->rhuStaffA = $this->user('QR RHU A', 'qr-rhu-a@example.test', User::ROLE_RHU_STAFF, $this->rhuA->id);
        $this->rhuStaffB = $this->user('QR RHU B', 'qr-rhu-b@example.test', User::ROLE_RHU_STAFF, $this->rhuB->id);
        $this->patientA = $this->patient('Secure', 'Patient', $this->bhcA);
        $this->referralA = $this->referral($this->patientA, $this->bhcA, $this->rhuA, $this->bhwA);
    }

    public function test_authorized_bhw_lazily_obtains_an_opaque_secure_qr_without_serializing_secrets(): void
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('Pragma', 'no-cache');
        $qrValue = $response->json('data.qr_value');
        $token = $this->tokenFromPayload($qrValue);

        $this->assertNotSame((string) $this->referralA->id, $token);
        $this->assertNotSame($this->referralA->tracking_id, $token);
        $this->assertStringNotContainsString($this->patientA->first_name, $qrValue);
        $this->assertMatchesRegularExpression(ReferralQrService::TOKEN_PATTERN, $token);

        $stored = $this->referralA->fresh();
        $this->assertSame(hash('sha256', $token), $stored->getRawOriginal('qr_token_hash'));
        $this->assertNotSame($token, $stored->getRawOriginal('qr_token_encrypted'));
        $this->assertNotNull($stored->qr_token_issued_at);

        $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.qr_code_value')
            ->assertJsonMissingPath('data.qr_token_hash')
            ->assertJsonMissingPath('data.qr_token_encrypted');
    }

    public function test_authorized_rhu_resolves_qr_then_details_authorizes_again_and_audits_safely(): void
    {
        $token = $this->issueToken();

        $resolution = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertOk()
            ->assertJsonPath('data.referral_id', $this->referralA->id)
            ->assertJsonPath('data.tracking_id', $this->referralA->tracking_id)
            ->assertJsonPath('data.display_url', "/rhu/referrals/{$this->referralA->tracking_id}");

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/referrals/'.$resolution->json('data.referral_id'))
            ->assertOk()
            ->assertJsonPath('data.id', $this->referralA->id);

        $audit = AuditLog::where('action', 'qr_resolved')->firstOrFail();
        $this->assertStringNotContainsString($token, (string) $audit->description);
        $this->assertStringNotContainsString(hash('sha256', $token), (string) $audit->description);
        $this->assertNotNull($this->referralA->fresh()->qr_token_last_used_at);
    }

    public function test_qr_resolution_requires_active_authenticated_user_and_valid_facility_assignment(): void
    {
        $token = app(ReferralQrService::class)->issue($this->referralA);

        $this->postJson('/api/referrals/qr/resolve', ['token' => $token])->assertUnauthorized();

        $inactive = $this->user(
            'Inactive QR RHU',
            'inactive-qr-rhu@example.test',
            User::ROLE_RHU_STAFF,
            $this->rhuA->id,
            User::STATUS_INACTIVE
        );
        $this->actingAs($inactive, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertForbidden();

        $unassigned = User::create([
            'name' => 'Unassigned QR RHU',
            'email' => 'unassigned-qr-rhu@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_RHU_STAFF,
            'status' => User::STATUS_ACTIVE,
        ]);
        $this->actingAs($unassigned, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertForbidden();
    }

    public function test_valid_token_does_not_bypass_rhu_or_role_isolation(): void
    {
        $token = $this->issueToken();

        foreach ([$this->rhuStaffB, $this->bhwA] as $user) {
            $response = $this->actingAs($user, 'sanctum')
                ->postJson('/api/referrals/qr/resolve', ['token' => $token])
                ->assertNotFound()
                ->assertJsonPath('code', 'QR_LOOKUP_FAILED');

            $this->assertStringNotContainsString($this->patientA->first_name, $response->getContent());
            $this->assertStringNotContainsString($this->rhuA->name, $response->getContent());
        }
    }

    public function test_bhw_cannot_display_or_regenerate_another_bhc_referral_qr(): void
    {
        $this->actingAs($this->bhwB, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertForbidden();
        $this->actingAs($this->bhwB, 'sanctum')
            ->postJson("/api/referrals/{$this->referralA->id}/qr/regenerate")
            ->assertForbidden();

        $this->assertNull($this->referralA->fresh()->getRawOriginal('qr_token_hash'));
    }

    public function test_malformed_unknown_empty_and_legacy_qr_values_fail_safely(): void
    {
        foreach (['', 'AKAY:REFERRAL:'.$this->referralA->tracking_id, 'AKAY-REFERRAL:v1:short'] as $token) {
            $this->actingAs($this->rhuStaffA, 'sanctum')
                ->postJson('/api/referrals/qr/resolve', ['token' => $token])
                ->assertUnprocessable()
                ->assertJsonPath('code', 'INVALID_QR_FORMAT');
        }

        $randomToken = $this->randomToken();
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $randomToken])
            ->assertNotFound()
            ->assertJsonPath('code', 'QR_LOOKUP_FAILED');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->getJson('/api/tracking/'.urlencode($this->referralA->tracking_id))
            ->assertNotFound();
    }

    public function test_tracking_lookup_is_authenticated_exact_and_facility_scoped(): void
    {
        $this->postJson('/api/referrals/tracking/resolve', [
            'tracking_id' => $this->referralA->tracking_id,
        ])->assertUnauthorized();

        foreach ([$this->bhwA, $this->rhuStaffA] as $user) {
            $this->actingAs($user, 'sanctum')
                ->postJson('/api/referrals/tracking/resolve', [
                    'tracking_id' => $this->referralA->tracking_id,
                ])
                ->assertOk()
                ->assertJsonPath('data.referral_id', $this->referralA->id);
        }

        $this->actingAs($this->bhwB, 'sanctum')
            ->postJson('/api/referrals/tracking/resolve', [
                'tracking_id' => $this->referralA->tracking_id,
            ])
            ->assertNotFound()
            ->assertJsonPath('code', 'TRACKING_LOOKUP_FAILED');

        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/tracking/resolve', [
                'tracking_id' => (string) $this->referralA->id,
            ])
            ->assertNotFound()
            ->assertJsonPath('code', 'TRACKING_LOOKUP_FAILED');

    }

    public function test_regeneration_replaces_token_without_changing_referral_identity_or_ownership(): void
    {
        $oldToken = $this->issueToken();
        $original = $this->referralA->only([
            'tracking_id',
            'barangay_health_center_id',
            'rural_health_unit_id',
        ]);

        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/referrals/{$this->referralA->id}/qr/regenerate")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private');
        $newToken = $this->tokenFromPayload($response->json('data.qr_value'));

        $this->assertNotSame($oldToken, $newToken);
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $oldToken])
            ->assertNotFound()
            ->assertJsonPath('code', 'QR_LOOKUP_FAILED');
        $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $newToken])
            ->assertOk()
            ->assertJsonPath('data.referral_id', $this->referralA->id);

        $this->assertSame($original, $this->referralA->fresh()->only(array_keys($original)));
        $audit = AuditLog::where('action', 'qr_regenerated')->firstOrFail();
        $this->assertStringNotContainsString($newToken, (string) $audit->description);
    }

    public function test_repeated_display_reuses_one_active_token_and_one_generation_audit(): void
    {
        $first = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertOk()
            ->json('data.qr_value');
        $second = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertOk()
            ->json('data.qr_value');

        $this->assertSame($first, $second);
        $this->assertSame(1, AuditLog::where('action', 'qr_generated')->count());
    }

    public function test_referral_details_rejects_cross_facility_idor_after_or_without_scan(): void
    {
        $this->actingAs($this->rhuStaffB, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}")
            ->assertForbidden();
        $this->actingAs($this->bhwB, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}")
            ->assertForbidden();
    }

    public function test_admin_keeps_existing_details_access_but_cannot_use_clinical_qr_workflows(): void
    {
        $admin = User::create([
            'name' => 'QR Admin',
            'email' => 'qr-admin@example.test',
            'password' => Hash::make('password123'),
            'role' => User::ROLE_ADMIN,
            'status' => User::STATUS_ACTIVE,
        ]);
        $token = $this->issueToken();

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}")
            ->assertOk();
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertForbidden();
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertNotFound()
            ->assertJsonPath('code', 'QR_LOOKUP_FAILED');
    }

    public function test_qr_resolution_rate_limit_allows_normal_use_and_hides_token_validity_when_exceeded(): void
    {
        $token = $this->randomToken();

        for ($attempt = 1; $attempt <= 60; $attempt++) {
            $this->actingAs($this->rhuStaffA, 'sanctum')
                ->postJson('/api/referrals/qr/resolve', ['token' => $token])
                ->assertNotFound();
        }

        $response = $this->actingAs($this->rhuStaffA, 'sanctum')
            ->postJson('/api/referrals/qr/resolve', ['token' => $token])
            ->assertTooManyRequests();
        $response->assertJsonPath('message', 'Too Many Attempts.');
        $this->assertNull($response->json('data'));
        $this->assertNull($response->json('code'));
    }

    public function test_tracking_lookup_and_regeneration_have_independent_rate_limits(): void
    {
        for ($attempt = 1; $attempt <= 30; $attempt++) {
            $this->actingAs($this->bhwA, 'sanctum')
                ->postJson('/api/referrals/tracking/resolve', [
                    'tracking_id' => 'AKY-20260720-ZZZZZZ',
                ])
                ->assertNotFound();
        }
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson('/api/referrals/tracking/resolve', [
                'tracking_id' => 'AKY-20260720-ZZZZZZ',
            ])
            ->assertTooManyRequests();

        for ($attempt = 1; $attempt <= 10; $attempt++) {
            $this->actingAs($this->bhwA, 'sanctum')
                ->postJson("/api/referrals/{$this->referralA->id}/qr/regenerate")
                ->assertOk();
        }
        $this->actingAs($this->bhwA, 'sanctum')
            ->postJson("/api/referrals/{$this->referralA->id}/qr/regenerate")
            ->assertTooManyRequests();
    }

    private function issueToken(): string
    {
        $response = $this->actingAs($this->bhwA, 'sanctum')
            ->getJson("/api/referrals/{$this->referralA->id}/qr")
            ->assertOk();

        return $this->tokenFromPayload($response->json('data.qr_value'));
    }

    private function tokenFromPayload(string $payload): string
    {
        $this->assertStringStartsWith(ReferralQrService::PAYLOAD_PREFIX, $payload);

        return substr($payload, strlen(ReferralQrService::PAYLOAD_PREFIX));
    }

    private function randomToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    private function referral(
        Patient $patient,
        BarangayHealthCenter $bhc,
        RuralHealthUnit $rhu,
        User $creator
    ): Referral {
        return Referral::create([
            'tracking_id' => 'AKY-20260720-'.Str::upper(Str::random(6)),
            'qr_code_value' => 'AKAY:REFERRAL:LEGACY-'.Str::uuid(),
            'patient_id' => $patient->id,
            'barangay_health_center_id' => $bhc->id,
            'rural_health_unit_id' => $rhu->id,
            'created_by' => $creator->id,
            'status' => Referral::STATUS_PENDING,
            'reason_for_referral' => 'Secure QR test referral.',
        ]);
    }

    private function patient(
        string $firstName,
        string $lastName,
        BarangayHealthCenter $bhc
    ): Patient {
        return Patient::create([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'sex' => 'Female',
            'barangay_health_center_id' => $bhc->id,
            'created_by' => $this->bhwA?->id,
        ]);
    }

    private function user(
        string $name,
        string $email,
        string $role,
        int $facilityId,
        string $status = User::STATUS_ACTIVE
    ): User {
        return User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make('password123'),
            'role' => $role,
            'status' => $status,
            'barangay_health_center_id' => $role === User::ROLE_BHW ? $facilityId : null,
            'rural_health_unit_id' => $role === User::ROLE_RHU_STAFF ? $facilityId : null,
        ]);
    }
}
