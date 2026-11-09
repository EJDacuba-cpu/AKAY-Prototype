<?php

namespace Tests\Feature;

use App\Http\Middleware\CommitFormDraft;
use App\Models\RuralHealthUnit;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class DraftBridgeFacilityRequest extends FormRequest
{
    public static bool $allowed = true;

    public function authorize(): bool
    {
        return self::$allowed && $this->user()?->isAdmin();
    }

    public function rules(): array
    {
        return ['name' => 'required|string|unique:rural_health_units,name'];
    }
}

class DraftBridgeFacilityController
{
    public function __invoke(DraftBridgeFacilityRequest $request)
    {
        $row = RuralHealthUnit::create($request->validated());
        if ($request->header('X-Fixture-Fail')) {
            return response()->json(['message' => 'Retry'], 422);
        }

        return response()->json(['data' => $row], 201);
    }
}

class FormDraftCommitBridgeTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        // A private test form exercises the reusable commit bridge, independent of product scope.
        config(['form_drafts.forms.bridge-fixture' => [
            'roles' => ['admin'], 'permission' => null,
            'contexts' => ['create' => ['new'], 'edit' => ['rhu']], 'schema' => ['name' => true],
        ]]);
        $this->actor = User::create(['name' => 'Admin', 'email' => 'draft-bridge@test.test', 'password' => 'test-password', 'role' => 'admin', 'status' => 'active']);
        DraftBridgeFacilityRequest::$allowed = true;
        config(['form_draft_commits.routes' => [
            ...config('form_draft_commits.routes', []),
            'POST api/draft-bridge-fixture' => [['form_type' => 'bridge-fixture', 'mode' => 'create', 'context' => 'new']],
            'PATCH api/draft-bridge-fixture/{unit}' => [['form_type' => 'bridge-fixture', 'mode' => 'edit', 'context' => ['prefix' => 'rhu', 'route' => 'unit']]],
        ]]);
        Route::post('api/draft-bridge-fixture', DraftBridgeFacilityController::class)->middleware(['auth:sanctum', CommitFormDraft::class]);
        Route::get('api/draft-bridge-fixture', DraftBridgeFacilityController::class)->middleware(['auth:sanctum', CommitFormDraft::class]);
        Route::patch('api/draft-bridge-fixture/{unit}', DraftBridgeFacilityController::class)->middleware(['auth:sanctum', CommitFormDraft::class]);
        $this->actingAs($this->actor, 'sanctum');
    }

    private function draft(array $extra = []): array
    {
        return $this->postJson('/api/form-drafts', [...[
            'form_type' => 'bridge-fixture', 'mode' => 'create', 'context_key' => 'new',
            'transaction_uuid' => (string) Str::uuid(), 'schema_version' => 1, 'payload' => ['name' => 'Draft clinic'],
        ], ...$extra])->assertCreated()->json('data');
    }

    private function headers(array $draft): array
    {
        return ['X-Form-Draft-Id' => $draft['id'], 'X-Form-Draft-Version' => $draft['version'], 'X-Form-Draft-Transaction' => $draft['transaction_uuid']];
    }

    public function test_replay_precedes_unique_validation_but_rechecks_form_request_authorization(): void
    {
        $draft = $this->draft();
        $headers = $this->headers($draft);
        $first = $this->postJson('/api/draft-bridge-fixture', ['name' => 'One clinic'], $headers)->assertCreated()->json('data.id');
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'One clinic'], $headers)->assertCreated()->assertJsonPath('data.id', $first);
        $this->assertDatabaseCount('rural_health_units', 1);
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Different clinic'], $headers)->assertConflict();
        DraftBridgeFacilityRequest::$allowed = false;
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'One clinic'], $headers)->assertForbidden();
    }

    public function test_validation_and_non_success_roll_back_without_consuming_draft(): void
    {
        $draft = $this->draft();
        $headers = $this->headers($draft);
        $this->postJson('/api/draft-bridge-fixture', [], $headers)->assertUnprocessable();
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Rollback clinic'], [...$headers, 'X-Fixture-Fail' => '1'])->assertUnprocessable();
        $this->assertDatabaseCount('rural_health_units', 0);
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'active']);
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Rollback clinic'], $headers)->assertCreated();
    }

    public function test_wrong_method_target_or_owner_cannot_consume_another_draft(): void
    {
        $first = RuralHealthUnit::create(['name' => 'First']);
        $other = RuralHealthUnit::create(['name' => 'Other']);
        $draft = $this->draft(['mode' => 'edit', 'context_key' => 'rhu:'.$first->id]);
        $headers = $this->headers($draft);
        $this->getJson('/api/draft-bridge-fixture', $headers)->assertConflict();
        $this->patchJson('/api/draft-bridge-fixture/'.$other->id, ['name' => 'New'], $headers)->assertConflict();
        $otherUser = User::create(['name' => 'Other', 'email' => 'other-bridge@test.test', 'password' => 'test-password', 'role' => 'admin', 'status' => 'active']);
        $this->actingAs($otherUser, 'sanctum')->postJson('/api/draft-bridge-fixture', ['name' => 'New'], $headers)->assertNotFound();
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'active']);
    }

    public function test_no_header_requests_keep_existing_validation_and_no_draft_side_effects(): void
    {
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Legacy'])->assertCreated();
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Legacy'])->assertUnprocessable();
        $this->assertDatabaseCount('form_drafts', 0);
        $this->postJson('/api/draft-bridge-fixture', ['name' => 'Partial'], ['X-Form-Draft-Version' => '1'])->assertUnprocessable();
    }

    public function test_real_facility_save_consumes_the_draft_and_retries_return_one_record(): void
    {
        $active = config('form_drafts.forms');
        config(['form_drafts.forms.facility-rhu' => config('form_drafts.legacy_forms.facility-rhu')]);
        $draft = $this->draft(['form_type' => 'facility-rhu']);
        config(['form_drafts.forms' => $active]);
        $headers = $this->headers($draft);
        $body = ['name' => 'Actual facility', 'address' => 'Test address', 'status' => 'active'];
        $id = $this->postJson('/api/rural-health-units', $body, $headers)->assertCreated()->json('data.id');
        $this->assertDatabaseHas('form_drafts', ['public_id' => $draft['id'], 'status' => 'consumed']);
        $this->postJson('/api/rural-health-units', $body, $headers)->assertCreated()->assertJsonPath('data.id', $id);
        $this->assertDatabaseCount('rural_health_units', 1);
    }
}
