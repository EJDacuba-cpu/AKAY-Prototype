<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('professional_designation')->nullable();
            $table->json('permissions')->nullable();
        });
        Schema::create('facility_assignments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->nullable()->constrained();
            $table->foreignId('rural_health_unit_id')->nullable()->constrained();
            $table->json('permissions');
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->timestamps();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE public.facility_assignments ENABLE ROW LEVEL SECURITY');
            DB::statement('ALTER TABLE public.facility_assignments ADD CONSTRAINT facility_assignment_single_facility CHECK ((barangay_health_center_id IS NOT NULL) <> (rural_health_unit_id IS NOT NULL))');
            DB::statement('ALTER TABLE public.facility_assignments ADD CONSTRAINT facility_assignment_dates CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_assignments');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['professional_designation', 'permissions']));
    }
};
