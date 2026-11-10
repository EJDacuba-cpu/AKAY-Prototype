<?php

namespace App\Http\Requests;

use App\Services\ActionPermissions;
use App\Services\TbClinicalAuthority;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class TbCaseRegistrationRequest extends FormRequest
{
    public const DOSE_FIELDS = ['drug4fdc', 'drug2fdc', 'drugH', 'drugR', 'drugZ', 'drugE'];

    public function authorize(): bool
    {
        return TbClinicalAuthority::canConfirm($this->user())
            && ActionPermissions::allows($this->user(), 'consultations.finalize')
            && ActionPermissions::allows($this->user(), 'clinical.history');
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['registration_key' => strtolower((string) $this->header('Idempotency-Key'))]);
    }

    public function rules(): array
    {
        $rules = [
            'registration_key' => ['required', 'uuid'],
            'source_revision' => ['required', 'string', 'regex:/\A[a-f0-9]{64}\z/'],
            'reporting_year' => ['required', 'integer', 'between:1900,9999'],
            'case_number' => ['nullable', 'string', 'max:100'],
            'confirmed' => ['required', 'accepted'],
            'card_data' => ['required', 'array:caseFinding,diagnosis,classification,comorbidities,regimen,treatmentSupporter,phases'],
            'card_data.classification' => ['required', 'array:bacteriologicalStatus,anatomicalSite,extrapulmonarySite,registrationGroup'],
            'card_data.classification.bacteriologicalStatus' => ['required', Rule::in(['bacteriologically_confirmed', 'clinically_diagnosed'])],
            'card_data.classification.anatomicalSite' => ['required', Rule::in(['pulmonary', 'extrapulmonary'])],
            'card_data.classification.extrapulmonarySite' => ['required_if:card_data.classification.anatomicalSite,extrapulmonary', 'nullable', 'string', 'max:150'],
            'card_data.classification.registrationGroup' => ['required', Rule::in(['new', 'relapse', 'taf', 'talf', 'ptou', 'unknown_history'])],
            'card_data.regimen' => ['required', 'array:description,weightKg,rows'],
            'card_data.regimen.description' => ['required', 'string', 'max:255'],
            'card_data.regimen.weightKg' => ['required', 'numeric', 'gt:0'],
            'card_data.regimen.rows' => ['required', 'array', 'min:1', 'max:10'],
            'card_data.regimen.rows.*' => ['required', 'array:dateStart,drug4fdc,drug2fdc,drugH,drugR,drugZ,drugE,strength,unit'],
            'card_data.regimen.rows.*.dateStart' => ['required', 'date_format:Y-m-d'],
            'card_data.regimen.rows.*.strength' => ['required', 'string', 'max:100'],
            'card_data.regimen.rows.*.unit' => ['required', 'string', 'max:50'],
        ];
        foreach (self::DOSE_FIELDS as $field) {
            $rules["card_data.regimen.rows.*.$field"] = ['nullable', 'numeric', 'min:0'];
        }
        $groups = [
            'caseFinding' => ['ntpFacilityCode', 'provinceHuc', 'region', 'referredBy', 'screeningCategory', 'dateOfScreening'],
            'diagnosis' => ['dateOfNotification'],
            'comorbidities' => ['hivStatus', 'hivTestDate', 'artStatus', 'artStartDate', 'cptStatus', 'cptStartDate', 'otherComorbidities'],
            'treatmentSupporter' => ['locationOfTreatment', 'supporterName', 'supporterDesignation', 'supporterType', 'contactInfo', 'datSupported', 'scheduleOfTreatment'],
            'phases' => ['intensiveStart', 'intensiveEnd', 'continuationStart', 'continuationEnd'],
        ];
        foreach ($groups as $group => $fields) {
            $rules["card_data.$group"] = ['sometimes', 'array:'.implode(',', $fields)];
            foreach ($fields as $field) {
                $rules["card_data.$group.$field"] = $field === 'datSupported' ? ['nullable', 'boolean']
                    : (preg_match('/Date|Start|End|dateOf/', $field)
                        ? ['nullable', 'date_format:Y-m-d'] : ['nullable', 'string', 'max:500']);
            }
        }
        foreach (['patient_id', 'rural_health_unit_id', 'source_health_record_id', 'registered_by', 'registered_at', 'status', 'version'] as $field) {
            $rules[$field] = ['prohibited'];
        }

        return $rules;
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            foreach ((array) $this->input('card_data.regimen.rows', []) as $index => $row) {
                if (! is_array($row)) {
                    continue;
                }
                $hasDose = collect(self::DOSE_FIELDS)->contains(fn ($key) => is_numeric($row[$key] ?? null) && (float) $row[$key] > 0);
                if (! $hasDose) {
                    $validator->errors()->add("card_data.regimen.rows.$index", 'Enter at least one positive physician-prescribed dose.');
                }
            }
        });
    }
}
