<?php

namespace Tests\Unit\Services;

use App\Services\ClinicalRegistry;
use Tests\TestCase;

/**
 * Matching rules for App\Services\ClinicalRegistry, per
 * docs/superpowers/specs/2026-09-29-diagnosis-monitoring-surveillance-registry-design.md:
 * exact match against a name or listed alias, case- and whitespace-
 * insensitive, never fuzzy or substring.
 */
class ClinicalRegistryTest extends TestCase
{
    private function registry(): ClinicalRegistry
    {
        return new ClinicalRegistry;
    }

    public function test_matches_condition_by_official_name(): void
    {
        $match = $this->registry()->matchCondition('Hypertension');
        $this->assertSame(['key' => 'hypertension', 'name' => 'Hypertension'], $match);
    }

    public function test_matches_condition_by_alias(): void
    {
        $match = $this->registry()->matchCondition('HTN');
        $this->assertSame('hypertension', $match['key']);
        $this->assertSame('Hypertension', $match['name']);

        $match = $this->registry()->matchCondition('PTB');
        $this->assertSame('tuberculosis', $match['key']);
        $this->assertSame('Tuberculosis', $match['name']);
    }

    public function test_matching_ignores_case_and_extra_whitespace(): void
    {
        $match = $this->registry()->matchCondition('  hTn  ');
        $this->assertSame('hypertension', $match['key']);

        $match = $this->registry()->matchCondition('diabetes   mellitus');
        $this->assertSame('diabetes_mellitus', $match['key']);
    }

    public function test_no_fuzzy_or_substring_matching(): void
    {
        $this->assertNull($this->registry()->matchCondition('Hyper'));
        $this->assertNull($this->registry()->matchCondition('Hypertensionn'));
        $this->assertNull($this->registry()->matchCondition('Hipertension'));
    }

    public function test_unmatched_or_empty_condition_returns_null(): void
    {
        $this->assertNull($this->registry()->matchCondition('Asthma'));
        $this->assertNull($this->registry()->matchCondition(''));
        $this->assertNull($this->registry()->matchCondition(null));
    }

    public function test_validity_checks(): void
    {
        $registry = $this->registry();
        $this->assertTrue($registry->isValidConditionKey('hypertension'));
        $this->assertFalse($registry->isValidConditionKey('unknown'));
        $this->assertFalse($registry->isValidConditionKey(null));
    }

    public function test_all_returns_the_condition_list(): void
    {
        $all = $this->registry()->all();
        $this->assertSame(['monitored_conditions'], array_keys($all));
        $this->assertArrayHasKey('hypertension', $all['monitored_conditions']);
    }

    public function test_condition_identity_prefers_the_registry_key(): void
    {
        $registry = $this->registry();
        $this->assertSame('hypertension', $registry->conditionIdentity('hypertension', 'HTN'));
        $this->assertSame('name:post-op wound care', $registry->conditionIdentity(null, '  Post-op   Wound Care '));
    }

    public function test_only_tuberculosis_declares_monitoring_details(): void
    {
        $registry = $this->registry();
        $this->assertSame('tb_dots', $registry->monitoringDetailsFor('tuberculosis'));
        $this->assertNull($registry->monitoringDetailsFor('hypertension'));
        $this->assertNull($registry->monitoringDetailsFor(null));
    }
}
