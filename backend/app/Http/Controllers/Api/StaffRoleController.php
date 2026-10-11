<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StaffRoles;

class StaffRoleController extends Controller
{
    public function index()
    {
        return response()->json(['data' => StaffRoles::forApi()]);
    }
}
