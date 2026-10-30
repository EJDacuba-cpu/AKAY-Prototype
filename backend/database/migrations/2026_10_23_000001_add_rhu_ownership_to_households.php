<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Additive RHU household ownership. Existing BHC rows keep barangay_health_center_id
 * and their FSN namespace. RHU households use rural_health_unit_id instead.
 * Patient and household rows are not deleted or reassigned.
 */
return new class extends Migration
{
    private const PATIENTS_RHU_UNIQUE = 'patients_id_rhu_unique';

    public function up(): void
    {
        $this->extendHouseholds();
        $this->extendCounters();
        $this->extendPatients();
        $this->extendRelationships();
        $this->replaceMembershipRules();
        $this->restoreSqliteTriggers();
        if (DB::getDriverName() === 'pgsql') {
            DB::unprepared(file_get_contents(database_path('sql/allocate_rhu_household_fsn.sql')));
            DB::statement('REVOKE ALL ON FUNCTION akay_allocate_rhu_household_fsn(bigint, integer) FROM PUBLIC');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP FUNCTION IF EXISTS akay_allocate_rhu_household_fsn(bigint, integer)');
            DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_household_facility_exclusive');
            DB::statement('ALTER TABLE patients ADD CONSTRAINT patients_household_bhc_only CHECK (household_id IS NULL OR (barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL))');
            DB::statement('ALTER TABLE households DROP CONSTRAINT IF EXISTS households_exclusive_owner');
            DB::statement('ALTER TABLE household_fsn_counters DROP CONSTRAINT IF EXISTS household_fsn_counters_exclusive_owner');
            DB::statement('ALTER TABLE patient_relationships DROP CONSTRAINT IF EXISTS patient_relationships_exclusive_owner');
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::statement("DROP TRIGGER IF EXISTS patients_household_facility_{$event}");
                DB::unprepared("CREATE TRIGGER patients_household_bhc_{$event} BEFORE {$event} ON patients WHEN NEW.household_id IS NOT NULL AND (NEW.barangay_health_center_id IS NULL OR NEW.rural_health_unit_id IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'Household membership requires BHC ownership'); END");
                DB::statement("DROP TRIGGER IF EXISTS households_exclusive_owner_{$event}");
                DB::statement("DROP TRIGGER IF EXISTS household_fsn_counters_exclusive_owner_{$event}");
                DB::statement("DROP TRIGGER IF EXISTS patient_relationships_exclusive_owner_{$event}");
            }
        }
        Schema::table('patients', function (Blueprint $table) {
            $table->dropForeign(['household_id', 'rural_health_unit_id']);
        });
        Schema::table('patient_relationships', function (Blueprint $table) {
            $table->dropForeign(['patient_id', 'rural_health_unit_id']);
            $table->dropForeign(['relative_id', 'rural_health_unit_id']);
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
        if (collect(Schema::getIndexes('patients'))->contains(fn ($index) => $index['name'] === self::PATIENTS_RHU_UNIQUE)) {
            Schema::table('patients', fn (Blueprint $table) => $table->dropUnique(self::PATIENTS_RHU_UNIQUE));
        }
        Schema::table('households', function (Blueprint $table) {
            $table->dropUnique(['id', 'rural_health_unit_id']);
            $table->dropConstrainedForeignId('rural_health_unit_id');
        });
        DB::statement('DROP INDEX IF EXISTS households_rhu_serial_unique');
        DB::statement('DROP INDEX IF EXISTS household_fsn_counters_bhc_year_unique');
        DB::statement('DROP INDEX IF EXISTS household_fsn_counters_rhu_year_unique');
    }

    private function extendHouseholds(): void
    {
        Schema::table('households', function (Blueprint $table) {
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->restrictOnDelete();
            $table->unique(['id', 'rural_health_unit_id']);
        });
        $this->makeNullable('households', 'barangay_health_center_id');
        DB::statement('CREATE UNIQUE INDEX households_rhu_serial_unique ON households (rural_health_unit_id, serial_number) WHERE rural_health_unit_id IS NOT NULL');
        $this->exclusiveOwner('households', '(barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL) OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)', 'Household owner must be exactly one facility');
    }

    private function extendCounters(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE household_fsn_counters ADD COLUMN id BIGSERIAL');
            DB::statement('ALTER TABLE household_fsn_counters DROP CONSTRAINT household_fsn_counters_pkey');
            DB::statement('ALTER TABLE household_fsn_counters ADD PRIMARY KEY (id)');
            DB::statement('ALTER TABLE household_fsn_counters ALTER COLUMN barangay_health_center_id DROP NOT NULL');
            Schema::table('household_fsn_counters', function (Blueprint $table) {
                $table->foreignId('rural_health_unit_id')->nullable()->constrained()->restrictOnDelete();
            });
        } else {
            Schema::create('household_fsn_counters_tmp', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('barangay_health_center_id')->nullable();
                $table->unsignedBigInteger('rural_health_unit_id')->nullable();
                $table->unsignedInteger('year');
                $table->unsignedBigInteger('last_number')->default(0);
            });
            DB::statement('INSERT INTO household_fsn_counters_tmp (barangay_health_center_id, year, last_number) SELECT barangay_health_center_id, year, last_number FROM household_fsn_counters');
            Schema::drop('household_fsn_counters');
            Schema::rename('household_fsn_counters_tmp', 'household_fsn_counters');
            Schema::table('household_fsn_counters', function (Blueprint $table) {
                $table->foreign('barangay_health_center_id')->references('id')->on('barangay_health_centers')->restrictOnDelete();
                $table->foreign('rural_health_unit_id')->references('id')->on('rural_health_units')->restrictOnDelete();
            });
        }
        DB::statement('CREATE UNIQUE INDEX household_fsn_counters_bhc_year_unique ON household_fsn_counters (barangay_health_center_id, year) WHERE barangay_health_center_id IS NOT NULL');
        DB::statement('CREATE UNIQUE INDEX household_fsn_counters_rhu_year_unique ON household_fsn_counters (rural_health_unit_id, year) WHERE rural_health_unit_id IS NOT NULL');
        $this->exclusiveOwner('household_fsn_counters', '(barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL) OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)', 'FSN counter owner must be exactly one facility');
    }

    private function extendPatients(): void
    {
        if (! collect(Schema::getIndexes('patients'))->contains(fn ($index) => $index['name'] === self::PATIENTS_RHU_UNIQUE)) {
            Schema::table('patients', fn (Blueprint $table) => $table->unique(['id', 'rural_health_unit_id'], self::PATIENTS_RHU_UNIQUE));
        }
        Schema::table('patients', function (Blueprint $table) {
            $table->foreign(['household_id', 'rural_health_unit_id'])->references(['id', 'rural_health_unit_id'])->on('households')->restrictOnDelete();
        });
    }

    private function extendRelationships(): void
    {
        Schema::table('patient_relationships', function (Blueprint $table) {
            $table->foreignId('rural_health_unit_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreign(['patient_id', 'rural_health_unit_id'])->references(['id', 'rural_health_unit_id'])->on('patients')->restrictOnDelete();
            $table->foreign(['relative_id', 'rural_health_unit_id'])->references(['id', 'rural_health_unit_id'])->on('patients')->restrictOnDelete();
        });
        $this->makeNullable('patient_relationships', 'barangay_health_center_id');
        $this->exclusiveOwner('patient_relationships', '(barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL) OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)', 'Relationship owner must be exactly one facility');
    }

    private function replaceMembershipRules(): void
    {
        $rule = '(barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL) OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)';
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_household_bhc_only');
            DB::statement("ALTER TABLE patients ADD CONSTRAINT patients_household_facility_exclusive CHECK (household_id IS NULL OR ({$rule}))");
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::statement("DROP TRIGGER IF EXISTS patients_household_bhc_{$event}");
                DB::unprepared("CREATE TRIGGER patients_household_facility_{$event} BEFORE {$event} ON patients WHEN NEW.household_id IS NOT NULL AND NOT ((NEW.barangay_health_center_id IS NOT NULL AND NEW.rural_health_unit_id IS NULL) OR (NEW.barangay_health_center_id IS NULL AND NEW.rural_health_unit_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'Household membership requires exclusive BHC or RHU ownership'); END");
            }
        }
    }

    private function makeNullable(string $table, string $column): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE {$table} ALTER COLUMN {$column} DROP NOT NULL");

            return;
        }
        Schema::table($table, function (Blueprint $blueprint) use ($column) {
            $blueprint->unsignedBigInteger($column)->nullable()->change();
        });
    }

    private function exclusiveOwner(string $table, string $rule, string $message): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$table}_exclusive_owner CHECK ({$rule})");

            return;
        }
        foreach (['INSERT', 'UPDATE'] as $event) {
            DB::unprepared("CREATE TRIGGER {$table}_exclusive_owner_{$event} BEFORE {$event} ON {$table} WHEN NOT ({$this->sqliteRule($rule)}) BEGIN SELECT RAISE(ABORT, '{$message}'); END");
        }
    }

    private function sqliteRule(string $rule): string
    {
        return str_replace(['barangay_health_center_id', 'rural_health_unit_id'], ['NEW.barangay_health_center_id', 'NEW.rural_health_unit_id'], $rule);
    }

    /** Schema::change() rebuilds SQLite tables and drops triggers created by earlier migrations. */
    private function restoreSqliteTriggers(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }
        foreach (['INSERT', 'UPDATE'] as $event) {
            DB::statement("DROP TRIGGER IF EXISTS households_serial_{$event}");
            DB::unprepared("CREATE TRIGGER households_serial_{$event} BEFORE {$event} ON households WHEN NEW.serial_number != upper(trim(NEW.serial_number)) OR length(NEW.serial_number) = 0 BEGIN SELECT RAISE(ABORT, 'Household serial must be canonical'); END");
            DB::statement("DROP TRIGGER IF EXISTS patient_relationships_rules_{$event}");
            DB::unprepared("CREATE TRIGGER patient_relationships_rules_{$event} BEFORE {$event} ON patient_relationships WHEN NEW.patient_id >= NEW.relative_id OR NEW.type NOT IN ('spouse', 'sibling') BEGIN SELECT RAISE(ABORT, 'Invalid patient relationship'); END");
        }
    }
};
