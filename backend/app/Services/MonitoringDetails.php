<?php

namespace App\Services;

/**
 * Fields a Monitoring Details form must complete, per the monitoring_details
 * key a registered condition declares (config/clinical_registry.php). A new
 * specialized workflow adds one entry here and one form on the frontend
 * (components/features/health-records/wizard/MonitoringDetailsForms.jsx).
 */
final class MonitoringDetails
{
    public const REQUIRED_FIELDS = [
        // BHC monitoring records treatment support on the ITR. RHU case
        // registration (Form 4B case number / intensive start) is not re-required.
        'tb_dots' => [],
    ];
}
