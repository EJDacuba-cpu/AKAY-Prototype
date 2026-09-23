<?php

// Read-only deployment check. Never prints credentials or patient information.
require __DIR__.'/../backend/vendor/autoload.php';
$app = require __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$checks = [];
foreach (['facility_assignments', 'consultation_events', 'health_record_corrections'] as $table) {
    $checks[$table] = Illuminate\Support\Facades\Schema::hasTable($table);
}
$checks['user_access_columns'] = Illuminate\Support\Facades\Schema::hasColumns('users', ['permissions', 'professional_designation']);
$checks['draft_review_columns'] = Illuminate\Support\Facades\Schema::hasColumns('health_record_drafts', ['review_state', 'editor_user_id', 'editor_expires_at']);

if (isset($argv[1])) {
    $user = App\Models\User::findOrFail((int) $argv[1]);
    $choices = $app->make(App\Services\WorkingFacilityService::class)->available($user);
    $checks['account_active'] = $user->isActive();
    $checks['facility_lookup_succeeded'] = true;
    $checks['authorized_facility_count'] = count($choices);
    $controller = $app->make(App\Http\Controllers\Api\AuthController::class);
    $profile = $controller->profile(Illuminate\Http\Request::create('/api/auth/profile')->setUserResolver(fn () => $user));
    $checks['profile_response_ok'] = $profile->getStatusCode() === 200;
    if (in_array('--permissions', $argv, true)) {
        $checks['stored_role'] = $user->role;
        $checks['explicit_permissions_configured'] = $user->permissions !== null ? 'yes' : 'no';
        if (count($choices) === 1) {
            $app->make(App\Services\WorkingFacilityService::class)->select($user, $choices[0]['key']);
            $checks['effective_permissions'] = $user->workingFacility['permissions'];
            foreach (['patients', 'health-records', 'referrals', 'medicines'] as $endpoint) {
                $request = Illuminate\Http\Request::create('/api/'.$endpoint, 'GET')->setUserResolver(fn () => $user);
                try {
                    $response = $app->make(App\Http\Middleware\EnforceActionPermissions::class)->handle($request, fn () => response()->json(['ok' => true]));
                    $checks['route_permission_status'][$endpoint] = $response->getStatusCode();
                } catch (Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $error) {
                    $checks['route_permission_status'][$endpoint] = $error->getStatusCode();
                }
            }
        }
    }
}

echo json_encode($checks, JSON_PRETTY_PRINT).PHP_EOL;
exit(in_array(false, $checks, true) ? 1 : 0);
