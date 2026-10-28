<?php

namespace Tests\Unit\Services;

use App\Models\HealthRecord;
use App\Services\ReportingEntries;
use PHPUnit\Framework\TestCase;

class ReportingEntriesTest extends TestCase
{
    public function test_morbidity_only(): void
    {
        $this->assertSame([
            'id' => 'd1',
            'name' => 'Cough',
            'reportIn' => ['morbidity'],
            'reportAs' => 'morbidity',
            'includeInSurveillance' => false,
            'conditionKey' => null,
        ], ReportingEntries::normalizeForSave(['id' => 'd1', 'name' => 'Cough', 'reportIn' => ['morbidity']]));
    }

    public function test_notifiable_only(): void
    {
        $this->assertSame([
            'id' => 'd1',
            'name' => 'Measles',
            'reportIn' => ['notifiable'],
            'reportAs' => 'notifiable',
            'includeInSurveillance' => false,
            'conditionKey' => null,
        ], ReportingEntries::normalizeForSave(['id' => 'd1', 'name' => 'Measles', 'reportIn' => ['notifiable']]));
    }

    public function test_both_reports(): void
    {
        $this->assertSame([
            'id' => 'd1',
            'name' => 'Dengue',
            'reportIn' => ['morbidity', 'notifiable'],
            'reportAs' => 'notifiable',
            'includeInSurveillance' => false,
            'conditionKey' => null,
        ], ReportingEntries::normalizeForSave(['id' => 'd1', 'name' => 'Dengue', 'reportIn' => ['notifiable', 'morbidity']]));
    }

    public function test_surveillance_only(): void
    {
        $this->assertSame([
            'id' => 'd1',
            'name' => 'HFMD',
            'reportIn' => ['surveillance'],
            'reportAs' => null,
            'includeInSurveillance' => true,
            'conditionKey' => null,
        ], ReportingEntries::normalizeForSave(['id' => 'd1', 'name' => 'HFMD', 'reportIn' => ['surveillance']]));
    }

    public function test_all_three(): void
    {
        $this->assertSame([
            'id' => 'd1',
            'name' => 'Dengue',
            'reportIn' => ['morbidity', 'notifiable', 'surveillance'],
            'reportAs' => 'notifiable',
            'includeInSurveillance' => true,
            'conditionKey' => null,
        ], ReportingEntries::normalizeForSave([
            'id' => 'd1',
            'name' => 'Dengue',
            'reportIn' => ['surveillance', 'notifiable', 'morbidity'],
        ]));
    }

    public function test_unknown_and_duplicate_destinations_are_dropped(): void
    {
        $result = ReportingEntries::normalizeForSave([
            'id' => 'd1',
            'name' => 'Cough',
            'reportIn' => ['morbidity', 'bogus', 'morbidity', 7, null, 'surveillance', 'surveillance'],
        ]);

        $this->assertSame(['morbidity', 'surveillance'], $result['reportIn']);
        $this->assertSame('morbidity', $result['reportAs']);
        $this->assertTrue($result['includeInSurveillance']);
    }

    public function test_client_report_as_and_condition_key_are_ignored(): void
    {
        $result = ReportingEntries::normalizeForSave([
            'id' => 'd1',
            'name' => 'TB',
            'reportAs' => 'morbidity',
            'conditionKey' => 'tuberculosis',
            'carePlan' => 'refer',
            'reportIn' => ['surveillance'],
        ]);

        $this->assertNull($result['reportAs']);
        $this->assertNull($result['conditionKey']);
        $this->assertArrayNotHasKey('carePlan', $result);
        $this->assertSame(['id', 'name', 'reportIn', 'reportAs', 'includeInSurveillance', 'conditionKey'], array_keys($result));
    }

    public function test_name_is_trimmed_not_renamed(): void
    {
        $result = ReportingEntries::normalizeForSave(['id' => 'd1', 'name' => ' PTB ', 'reportIn' => ['morbidity']]);

        $this->assertSame('PTB', $result['name']);
    }

    public function test_legacy_entry_destinations(): void
    {
        $this->assertSame(
            ['notifiable', 'surveillance'],
            ReportingEntries::destinations(['reportAs' => 'notifiable', 'includeInSurveillance' => true])
        );
        $this->assertSame(['morbidity'], ReportingEntries::destinations(['reportAs' => 'morbidity']));
        $this->assertSame(['surveillance'], ReportingEntries::destinations(['includeInSurveillance' => true]));
    }

    public function test_empty_report_in_preserves_unclassified_concern_and_care_outcome(): void
    {
        $result = ReportingEntries::normalizeForSave([
            'id' => 'c1',
            'name' => 'Cough',
            'reportIn' => [],
            'clinicalOutcome' => 'managed_at_bhc',
            'conditionKey' => 'hypertension',
        ]);

        $this->assertSame([], $result['reportIn']);
        $this->assertNull($result['reportAs']);
        $this->assertFalse($result['includeInSurveillance']);
        $this->assertNull($result['conditionKey']);
        $this->assertSame('managed_at_bhc', $result['clinicalOutcome']);
        $this->assertSame('not_included', ReportingEntries::visitStatus([$result]));
    }

    public function test_legacy_null_report_as_has_no_destinations(): void
    {
        $this->assertSame([], ReportingEntries::destinations(['reportAs' => null, 'includeInSurveillance' => false]));
        $this->assertSame([], ReportingEntries::destinations(['reportAs' => 'bogus']));
        $this->assertSame([], ReportingEntries::destinations('not-an-array'));
        $this->assertSame([], ReportingEntries::destinations(null));
    }

    public function test_visit_status_order(): void
    {
        $this->assertSame('notifiable', ReportingEntries::visitStatus([
            ['reportIn' => ['morbidity']],
            ['reportIn' => ['notifiable']],
        ]));
        $this->assertSame('notifiable', ReportingEntries::visitStatus([
            ['reportAs' => 'morbidity'],
            ['reportAs' => 'notifiable'],
        ]));
        $this->assertSame('morbidity', ReportingEntries::visitStatus([
            ['reportIn' => ['surveillance']],
            ['reportIn' => ['morbidity']],
        ]));
        $this->assertSame('not_included', ReportingEntries::visitStatus([
            ['reportIn' => ['surveillance']],
        ]));
        $this->assertSame('not_included', ReportingEntries::visitStatus([]));
    }

    public function test_health_record_detects_the_v2_workflow(): void
    {
        $this->assertSame('bhc_general_v2', HealthRecord::WORKFLOW_BHC_GENERAL_V2);

        $v2 = new HealthRecord(['monitoring_data' => ['consultationWorkflow' => 'bhc_general_v2']]);
        $this->assertTrue($v2->isBhcGeneralV2());
        $this->assertFalse((new HealthRecord(['monitoring_data' => ['consultationWorkflow' => 'other']]))->isBhcGeneralV2());
        $this->assertFalse((new HealthRecord)->isBhcGeneralV2());
    }
}
