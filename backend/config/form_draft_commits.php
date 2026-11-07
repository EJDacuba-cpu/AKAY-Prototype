<?php

$routes = [];
foreach ([
    'facility-bhc' => ['barangay-health-centers', 'barangay_health_center', 'bhc'],
    'facility-rhu' => ['rural-health-units', 'rural_health_unit', 'rhu'],
] as $form => [$resource, $parameter, $prefix]) {
    $routes['POST api/'.$resource] = [['form_type' => $form, 'mode' => 'create', 'context' => 'new']];
    foreach (['PUT', 'PATCH'] as $method) {
        $routes[$method.' api/'.$resource.'/{'.$parameter.'}'] = [[
            'form_type' => $form, 'mode' => 'edit', 'context' => ['prefix' => $prefix, 'route' => $parameter],
        ]];
    }
}

// Existing identities and lost-response replays only; ordinary CRUD bypasses the bridge.
return ['routes' => ['POST api/patients' => [
    ['form_type' => 'patient', 'mode' => 'create', 'context' => 'new'],
    ['form_type' => 'patient', 'mode' => 'create', 'context' => ['prefix' => 'household', 'body' => 'household.household_id']],
]], 'legacy_routes' => $routes];
