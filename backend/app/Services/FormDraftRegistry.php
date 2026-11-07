<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\RhuProvider;
use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class FormDraftRegistry
{
    public function __construct(private readonly FacilityAccessService $access) {}

    public function identity(User $user, array $input, bool $device = false, bool $allowLegacy = false): array
    {
        $data = Validator::make($input, ['form_type' => 'required|string|max:80', 'mode' => 'required|in:create,edit', 'context_key' => 'required|string|max:160'])->validate();
        abort_unless($user->isActive(), 403);
        $definition = config('form_drafts.forms', [])[$data['form_type']] ?? null;
        if ($allowLegacy) {
            $definition = config('form_drafts.legacy_forms', [])[$data['form_type']] ?? $definition;
        }
        if ($device && $data['form_type'] === 'consultation') {
            $definition = ['roles' => ['bhc', 'rhu'], 'permission' => 'consultations.encode', 'contexts' => ['create' => [$user->isRhu() ? 'visit' : 'patient'], 'edit' => [$user->isRhu() ? 'visit' : 'patient']]];
        }
        if (! $definition) {
            throw ValidationException::withMessages(['form_type' => 'This form is not registered for recovery.']);
        }
        abort_unless(in_array($user->workflowRole(), $definition['roles'], true), 403);
        $this->access->ensureValidFacilityAssignment($user);
        if ($definition['permission'] && ! ($user->isAdmin() && $data['form_type'] === 'patient')) {
            $allowed = ActionPermissions::allows($user, $definition['permission']);
            if ($data['form_type'] === 'consultation' && $user->isRhu()) {
                $allowed = $allowed || ActionPermissions::allows($user, 'consultations.finalize');
            }
            if ($data['form_type'] === 'referral-intake') {
                $allowed = $allowed || ActionPermissions::allows($user, 'rhu.manage');
            }
            abort_unless($allowed, 403);
            foreach (ActionPermissions::REQUIRES[$definition['permission']] ?? [] as $read) {
                ActionPermissions::ensure($user, $read);
            }
        }
        $parts = explode(':', $data['context_key']);
        $target = $parts[0];
        $valid = $target === 'new' ? count($parts) === 1 : count($parts) === 2 && preg_match('/^[1-9][0-9]*$/D', $parts[1]);
        if (! $valid || ! in_array($target, $definition['contexts'][$data['mode']] ?? [], true)) {
            throw ValidationException::withMessages(['context_key' => 'The form context does not match its registered action.']);
        }
        if ($target !== 'new') {
            $this->authorizeTarget($user, $target, (int) $parts[1], $data['form_type']);
        }
        $scope = $user->isAdmin() ? 'admin' : $user->workflowRole().':'.($user->isBhc() ? $user->barangay_health_center_id : $user->rural_health_unit_id);
        $scope = $user->role.':'.$scope;
        if ($data['form_type'] === 'consultation') {
            $permissions = $user->workingFacility['permissions'] ?? ActionPermissions::home($user);
            sort($permissions);
            $scope .= ':'.substr(hash('sha256', json_encode($permissions)), 0, 16);
        }
        $slot = hash('sha256', implode('|', [$user->id, $scope, ...array_values($data)]));

        return [...$data, 'scope' => $scope, 'slot_hash' => $slot];
    }

    private function authorizeTarget(User $user, string $target, int $id, string $form): void
    {
        $models = ['patient' => 'Patient', 'household' => 'Household', 'relationship' => 'PatientRelationship', 'medicine' => 'Medicine', 'record' => 'HealthRecord', 'referral' => 'Referral', 'follow-up' => 'FollowUpTask', 'provider' => 'RhuProvider', 'absence' => 'RhuProviderUnavailability', 'visit' => 'RhuVisitQueueEntry', 'hold' => 'ReferralHold', 'handoff' => 'MonitoringHandoffRequest', 'user' => 'User', 'invite' => 'AccountInvite', 'reset' => 'PasswordResetRequest', 'bhc' => 'BarangayHealthCenter', 'rhu' => 'RuralHealthUnit'];
        $class = 'App\\Models\\'.$models[$target];
        $record = $class::findOrFail($id);
        if ($user->isAdmin()) {
            return;
        }
        switch ($target) {
            case 'patient':
                if (in_array($form, ['patient', 'household-transfer', 'patient-parent-mother', 'patient-parent-father', 'referral'], true)) {
                    $this->access->authorizePatientModification($user, $record);
                } elseif ($form === 'visit-check-in') {
                    abort_unless($this->access->scopeRhuWalkInPatients(Patient::query(), $user)->whereKey($id)->exists(), 403);
                } else {
                    $this->access->authorizePatient($user, $record);
                }
                break;
            case 'medicine': $this->access->authorizeMedicine($user, $record);
                break;
            case 'record': $this->access->authorizeHealthRecord($user, $record);
                break;
            case 'referral': $this->access->authorizeReferral($user, $record);
                break;
            case 'follow-up': $this->access->authorizeFollowUpTask($user, $record);
                break;
            case 'provider': $this->access->authorizeProviderManagement($user, $record);
                break;
            case 'absence': $this->access->authorizeProviderManagement($user, RhuProvider::findOrFail($record->rhu_provider_id));
                break;
            case 'handoff': app(MonitoringHandoffService::class)->findForBhc($user, $id);
                break;
            default:
                $column = $user->isBhc() ? 'barangay_health_center_id' : 'rural_health_unit_id';
                abort_unless($this->access->sameAssignedId($record->$column, $user->$column), 403);
        }
    }

    public function payload(string $form, mixed $payload): array
    {
        if (! is_array($payload) || strlen(json_encode($payload, JSON_THROW_ON_ERROR)) > config('form_drafts.max_payload_bytes')) {
            throw ValidationException::withMessages(['payload' => 'Draft input is too large or invalid.']);
        }
        $this->validateNode($payload, config('form_drafts.forms.'.$form.'.schema'), 'payload');

        return $payload;
    }

    private function validateNode(mixed $value, bool|array $schema, string $path): void
    {
        $invalid = false;
        if ($schema === true) {
            $invalid = ! is_null($value) && ! is_scalar($value) || (is_string($value) && mb_strlen($value) > config('form_drafts.max_string_length'));
        } elseif (is_array($value) && count($value) <= config('form_drafts.max_array_items')) {
            foreach ($value as $key => $child) {
                $node = $schema[$key] ?? (ctype_digit((string) $key) ? ($schema['*'] ?? null) : null);
                if ($node === null) {
                    throw ValidationException::withMessages([$path => 'This draft contains an unregistered field.']);
                }
                $this->validateNode($child, $node, $path.'.'.$key);
            }
        } else {
            $invalid = true;
        }
        if ($invalid) {
            throw ValidationException::withMessages([$path => 'This draft field has an unsupported value or size.']);
        }
    }
}
