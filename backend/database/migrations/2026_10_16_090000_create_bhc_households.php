<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('households', function (Blueprint $table) {
            $table->id();
            $table->foreignId('barangay_health_center_id')->constrained()->restrictOnDelete();
            $table->string('serial_number', 100);
            $table->json('address')->nullable();
            $table->foreignId('head_patient_id')->nullable()->constrained('patients')->restrictOnDelete();
            $table->timestamp('archived_at')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->unique(['barangay_health_center_id', 'serial_number']);
            $table->unique(['id', 'barangay_health_center_id']);
        });
        Schema::create('household_fsn_counters', function (Blueprint $table) {
            $table->foreignId('barangay_health_center_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('year');
            $table->unsignedBigInteger('last_number')->default(0);
            $table->primary(['barangay_health_center_id', 'year']);
        });
        Schema::table('patients', function (Blueprint $table) {
            $table->unsignedBigInteger('household_id')->nullable();
            $table->string('relationship_to_household_head', 100)->nullable();
            $table->foreign(['household_id', 'barangay_health_center_id'])->references(['id', 'barangay_health_center_id'])->on('households')->restrictOnDelete();
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE households ENABLE ROW LEVEL SECURITY');
            DB::statement('ALTER TABLE household_fsn_counters ENABLE ROW LEVEL SECURITY');
            DB::statement('ALTER TABLE households ADD CONSTRAINT households_serial_canonical CHECK (serial_number = upper(btrim(serial_number)) AND length(serial_number) > 0)');
            DB::statement('ALTER TABLE patients ADD CONSTRAINT patients_household_bhc_only CHECK (household_id IS NULL OR (barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL))');
            DB::unprepared(file_get_contents(database_path('sql/allocate_household_fsn.sql')));
            DB::statement('REVOKE ALL ON FUNCTION akay_allocate_household_fsn(bigint, integer) FROM PUBLIC');
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::unprepared("CREATE TRIGGER patients_household_bhc_{$event} BEFORE {$event} ON patients WHEN NEW.household_id IS NOT NULL AND (NEW.barangay_health_center_id IS NULL OR NEW.rural_health_unit_id IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'Household membership requires BHC ownership'); END");
                DB::unprepared("CREATE TRIGGER households_serial_{$event} BEFORE {$event} ON households WHEN NEW.serial_number != upper(trim(NEW.serial_number)) OR length(NEW.serial_number) = 0 BEGIN SELECT RAISE(ABORT, 'Household serial must be canonical'); END");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS akay_allocate_household_fsn(bigint, integer)');
            DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_household_bhc_only');
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::statement("DROP TRIGGER IF EXISTS patients_household_bhc_{$event}");
                DB::statement("DROP TRIGGER IF EXISTS households_serial_{$event}");
            }
        }
        Schema::table('patients', function (Blueprint $table) {
            $table->dropForeign(['household_id', 'barangay_health_center_id']);
            $table->dropColumn(['household_id', 'relationship_to_household_head']);
        });
        Schema::dropIfExists('household_fsn_counters');
        Schema::dropIfExists('households');
    }
};
