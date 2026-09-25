<?php

namespace App\Services;

use App\Models\Patient;
use Illuminate\Validation\Rule;

/** Versioned BHC purpose metadata. Legacy and RHU payloads remain unchanged. */
class VisitPurpose
{
    public const SERVICES = ['General', 'Prenatal', 'Postpartum', 'EPI', 'Family Planning', 'TB', 'Hypertension', 'Diabetes'];

    public static function rules(string $prefix): array
    {
        return [
            $prefix => ['sometimes', 'array:version,services,overrideReason,pregnancyConfirmed'],
            "$prefix.version" => ["required_with:$prefix", 'integer', 'in:1'],
            "$prefix.services" => ["required_with:$prefix", 'array', 'list', 'min:1', 'max:8'],
            "$prefix.services.*" => ['required', 'string', 'distinct', Rule::in(self::SERVICES)],
            "$prefix.overrideReason" => ['nullable', 'string', 'max:1000'],
            "$prefix.pregnancyConfirmed" => ['nullable', Rule::in(['Yes', 'No'])],
        ];
    }

    public static function programs(array $services): array
    {
        return array_values(array_unique(array_map(
            fn ($service) => in_array($service, ['Prenatal', 'Postpartum'], true) ? 'Maternal' : $service,
            array_values(array_filter($services, fn ($service) => $service !== 'General'))
        )));
    }

    public static function validate($validator, $request): void
    {
        if ($validator->errors()->isNotEmpty()) {
            return;
        }
        $purpose = $request->input('monitoring_data.visitPurpose');
        if ($purpose === null) {
            return;
        }
        $prefix = 'monitoring_data.visitPurpose';
        if (! $request->user()?->isBhw()) {
            $validator->errors()->add($prefix, 'Purpose of Visit is available to BHC workers only.');
            return;
        }
        if (! is_array($purpose) || ! is_array($purpose['services'] ?? null)) {
            return;
        }
        $services = $purpose['services'];
        if (array_diff($services, self::SERVICES)) {
            return;
        }
        $expected = self::programs($services);
        $actual = $request->input('monitoring_data.selectedPrograms', []);
        if (! is_array($actual) || array_diff($expected, $actual) || array_diff($actual, $expected)) {
            $validator->errors()->add($prefix, 'Selected programs must match the purpose of visit.');
        }
        $patient = Patient::find($request->input('patient_id'));
        if (! $patient) {
            return;
        }
        try {
            $date = new \DateTimeImmutable(substr($request->input('date_recorded') ?: now()->toDateString(), 0, 10));
            $birth = $patient->birthdate ? new \DateTimeImmutable($patient->birthdate->format('Y-m-d')) : null;
        } catch (\Exception) {
            return; // The normal date rule reports malformed dates.
        }
        $knownAge = $birth && $birth <= $date;
        $years = $knownAge ? $birth->diff($date)->y : null;
        $infant = $knownAge && $date <= $birth->modify('+1 year');
        foreach ($services as $service) {
            if ($service === 'General') {
                continue;
            }
            $maternal = in_array($service, ['Prenatal', 'Postpartum'], true);
            if (! $knownAge) {
                $validator->errors()->add($prefix, 'A valid birthdate is required for this service.');
            } elseif ($maternal && ! str_starts_with(strtolower((string) $patient->sex), 'f')) {
                $validator->errors()->add($prefix, 'Maternal services require a patient recorded as female.');
            } elseif ($infant) {
                if ($service !== 'EPI') {
                    $validator->errors()->add($prefix, 'Only General Consultation and EPI are available at 0–12 months.');
                }
            } elseif ($years < 11) {
                if (blank($purpose['overrideReason'] ?? null)) {
                    $validator->errors()->add("$prefix.overrideReason", 'A BHC eligibility override reason is required for ages 1–10.');
                }
            } elseif ($service === 'EPI' || ($years < 18 && ! $maternal)) {
                $validator->errors()->add($prefix, 'This service is outside the configured age window.');
            }
        }

        // Warning only; neither Yes nor No changes referral or diagnosis.
        if (filled($purpose['pregnancyConfirmed'] ?? null) && ! (in_array('Prenatal', $services, true) && $years >= 11 && $years <= 17)) {
            $validator->errors()->add("$prefix.pregnancyConfirmed", 'Pregnancy confirmation applies only to a teenage Prenatal visit.');
        }
        if (in_array('General', $services, true)) {
            foreach (['chief_complaint' => 'Chief complaint'] as $field => $label) {
                if (blank($request->input($field))) {
                    $validator->errors()->add($field, "$label is required for General Consultation.");
                }
            }
        }
        if (in_array('Family Planning', $services, true) && blank($request->input('family_planning_data.methodUsed'))) {
            $validator->errors()->add('family_planning_data.methodUsed', 'Method used / accepted is required.');
        }
        if (in_array('TB', $services, true)) {
            foreach (['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart'] as $field) {
                if (blank($request->input($field))) {
                    $validator->errors()->add($field, 'This field is required for TB monitoring.');
                }
            }
        }
        if (array_intersect(['Hypertension', 'Diabetes'], $services)) {
            foreach (['vital_signs.systolicBp', 'vital_signs.diastolicBp', 'monitoring_data.hypertensionDiabeticData.conditionType'] as $field) {
                if (blank($request->input($field))) {
                    $validator->errors()->add($field, 'This field is required for Hypertension / Diabetic monitoring.');
                }
            }
        }
        if (in_array('EPI', $services, true) && empty($request->input('immunization_data.vaccineEntries')) && blank($request->input('notes'))) {
            $validator->errors()->add('immunization_data.vaccineEntries', 'Select a vaccine or enter remarks if no vaccine was given.');
        }
    }
}
