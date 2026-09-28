<?php

/*
|--------------------------------------------------------------------------
| Clinical Registry
|--------------------------------------------------------------------------
|
| Single source of truth for three lists a consultation reads from, per
| docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
|
| - monitored_conditions: diagnoses that, once recorded, automatically sync
|   to the patient's Current Conditions (App\Services\ClinicalRegistry /
|   App\Services\CurrentConditionsSync). Each names the Care Pathway it
|   makes AVAILABLE - it never starts, pre-selects, or infers an enrollment.
| - surveillance_diseases: diseases a visit can be tagged for under Records
|   & Surveillance. A matching diagnosis only SUGGESTS the tag.
| - care_pathways: longitudinal monitoring workflows (Start Monitoring /
|   Continue Follow-up), served here instead of a separate endpoint.
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
            'pathway' => 'ncd',
        ],
        'diabetes_mellitus' => [
            'name' => 'Diabetes Mellitus',
            'aliases' => ['DM', 'Diabetes'],
            'pathway' => 'ncd',
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
            'pathway' => 'tb_dots',
        ],
    ],

    'surveillance_diseases' => [
        'hfmd' => [
            'name' => 'Hand, Foot and Mouth Disease',
            'aliases' => ['HFMD'],
        ],
    ],

    'care_pathways' => [
        'ncd' => [
            'label' => 'NCD Monitoring',
            'category' => 'NCD Monitoring',
            'field_sets' => [
                'hypertension_monitoring' => [
                    'label' => 'Hypertension Monitoring',
                    'fields' => [],
                ],
                'diabetes_monitoring' => [
                    'label' => 'Diabetes Monitoring',
                    'fields' => [
                        'fbs' => [
                            'label' => 'Fasting Blood Sugar (FBS)',
                            'type' => 'string',
                            'max' => 100,
                        ],
                    ],
                ],
            ],
        ],
        'tb_dots' => [
            'label' => 'TB-DOTS',
            'category' => 'TB DOTS / TB Monitoring',
            // TB keeps its own existing verified form and health_records.tb_data
            // column - it is not expressed as generic field sets.
            'uses_dedicated_form' => true,
        ],
    ],

];
