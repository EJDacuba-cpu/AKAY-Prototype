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
        'tb_dots' => ['tb_data.diagnosis.tbCaseNumber', 'tb_data.phases.intensiveStart'],
    ];
}
