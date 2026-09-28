<?php
// backend/tests/Unit/Services/ActionPermissionsCarePathwayTest.php

namespace Tests\Unit\Services;

use App\Services\ActionPermissions;
use Tests\TestCase;

class ActionPermissionsCarePathwayTest extends TestCase
{
    public function test_care_pathways_manage_is_a_known_permission_in_the_clinical_preset(): void
    {
        $this->assertContains('care_pathways.manage', ActionPermissions::ALL);
        $this->assertContains('care_pathways.manage', ActionPermissions::PRESETS['clinical']);
        $this->assertNotContains('care_pathways.manage', ActionPermissions::PRESETS['encoder']);
    }
}
