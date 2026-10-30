<?php

/*
|--------------------------------------------------------------------------
| Clinical Registry
|--------------------------------------------------------------------------
|
| Single source of truth for recognising a condition by name:
|
| - monitored_conditions: the conditions the system knows by name or alias.
|   The registry only gives a condition one identity (so "HTN" and
|   "Hypertension" are the same condition) and, where an entry declares
|   monitoring_details, the key of the extra form a monitored BHC visit
|   needs. It never writes Current Conditions or starts monitoring: a
|   condition is confirmed by the RHU, and BHC monitoring starts only from
|   that confirmed condition.
|
| Matching (App\Services\ClinicalRegistry::matchCondition)
| is exact, case- and whitespace-insensitive, against a name or one of its
| aliases - never fuzzy, substring, or typo-tolerant. A new entry is a
| reviewed code change here, not a runtime edit; the shape below is chosen
| so a later admin-editable table is additive, not a redesign.
|
*/

return [

    'monitored_conditions' => [
        'hypertension' => [
            'name' => 'Hypertension',
            'aliases' => ['HTN', 'High blood pressure'],
        ],
        'diabetes_mellitus' => [
            'name' => 'Diabetes Mellitus',
            'aliases' => ['DM', 'Diabetes'],
        ],
        'tuberculosis' => [
            'name' => 'Tuberculosis',
            'aliases' => [
                'TB',
                'PTB',
                'EPTB',
                'Pulmonary TB',
                'Pulmonary Tuberculosis',
                'Extrapulmonary TB',
                'Extrapulmonary Tuberculosis',
            ],
            // Extra fields the ITR does not hold: Monitoring Details renders the
            // DS-TB Treatment Card (health_records.tb_data) for this key.
            'monitoring_details' => 'tb_dots',
        ],
    ],

];
