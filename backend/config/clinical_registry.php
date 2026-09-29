<?php

/*
|--------------------------------------------------------------------------
| Clinical Registry
|--------------------------------------------------------------------------
|
| Single source of truth for two lists a consultation reads from:
|
| - monitored_conditions: diagnoses that, once recorded, automatically sync
|   to the patient's Current Conditions (App\Services\ClinicalRegistry /
|   App\Services\CurrentConditionsSync). An entry may declare monitoring_details:
|   the key of the extra form a monitored visit needs.
| - surveillance_diseases: diseases a visit can be tagged for under Records
|   & Surveillance. A matching diagnosis only SUGGESTS the tag.
|
| Matching (App\Services\ClinicalRegistry::matchCondition/matchSurveillance)
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

    'surveillance_diseases' => [
        'hfmd' => [
            'name' => 'Hand, Foot and Mouth Disease',
            'aliases' => ['HFMD'],
        ],
    ],

];
