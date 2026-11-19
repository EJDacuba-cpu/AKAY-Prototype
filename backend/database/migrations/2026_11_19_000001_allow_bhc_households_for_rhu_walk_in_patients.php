<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The BHC foreign key already matches the household to the patient's BHC.
        // Apply the RHU household foreign key only when there is no assigned BHC.
        $driver = DB::getDriverName();
        Schema::table('patients', function (Blueprint $table) use ($driver) {
            $table->dropForeign(['household_id', 'rural_health_unit_id']);
            $owner = $table->unsignedBigInteger('household_rural_health_unit_id')->nullable();
            $rhuOwner = 'CASE WHEN barangay_health_center_id IS NULL THEN rural_health_unit_id END';
            if ($driver === 'sqlite') {
                $owner->virtualAs($rhuOwner);
            } else {
                $owner->storedAs($rhuOwner);
            }
            $table->foreign(['household_id', 'household_rural_health_unit_id'], 'patients_household_rhu_owner_foreign')
                ->references(['id', 'rural_health_unit_id'])->on('households')->restrictOnDelete();
        });

        $this->setMembershipRule(false);
    }

    public function down(): void
    {
        if (DB::table('patients')->whereNotNull('household_id')->whereNotNull('barangay_health_center_id')
            ->whereNotNull('rural_health_unit_id')->exists()) {
            throw new RuntimeException('Some BHC household members have RHU affiliations and require this migration.');
        }

        Schema::table('patients', function (Blueprint $table) {
            $table->dropForeign(DB::getDriverName() === 'sqlite'
                ? ['household_id', 'household_rural_health_unit_id']
                : 'patients_household_rhu_owner_foreign');
            $table->foreign(['household_id', 'rural_health_unit_id'])
                ->references(['id', 'rural_health_unit_id'])->on('households')->restrictOnDelete();
        });
        Schema::table('patients', fn (Blueprint $table) => $table->dropColumn('household_rural_health_unit_id'));

        $this->setMembershipRule(true);
    }

    private function setMembershipRule(bool $exclusive): void
    {
        $rule = $exclusive
            ? '(barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL) OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)'
            : 'barangay_health_center_id IS NOT NULL OR rural_health_unit_id IS NOT NULL';

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE patients DROP CONSTRAINT patients_household_facility_exclusive');
            DB::statement("ALTER TABLE patients ADD CONSTRAINT patients_household_facility_exclusive CHECK (household_id IS NULL OR ({$rule}))");
        } elseif (DB::getDriverName() === 'sqlite') {
            $rule = str_replace(['barangay_health_center_id', 'rural_health_unit_id'], ['NEW.barangay_health_center_id', 'NEW.rural_health_unit_id'], $rule);
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::unprepared("DROP TRIGGER IF EXISTS patients_household_facility_{$event}");
                DB::unprepared("CREATE TRIGGER patients_household_facility_{$event} BEFORE {$event} ON patients WHEN NEW.household_id IS NOT NULL AND NOT ({$rule}) BEGIN SELECT RAISE(ABORT, 'Household membership requires a facility assignment'); END");
            }
        }
    }
};
