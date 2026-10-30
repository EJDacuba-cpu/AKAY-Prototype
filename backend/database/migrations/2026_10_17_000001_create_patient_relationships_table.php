<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Explicit spouse/sibling pairs between two patients of the same BHC.
 * Parent-child links stay on patients.mother_patient_id / father_patient_id.
 * Additive only: nothing existing is altered besides one unique index on
 * patients(id, barangay_health_center_id) that the same-facility composite
 * foreign keys need (id is already the primary key, so it cannot fail).
 */
return new class extends Migration
{
    private const PATIENT_UNIQUE = 'patients_id_bhc_unique';

    public function up(): void
    {
        if (! collect(Schema::getIndexes('patients'))->contains(fn ($index) => $index['name'] === self::PATIENT_UNIQUE)) {
            Schema::table('patients', fn (Blueprint $table) => $table->unique(['id', 'barangay_health_center_id'], self::PATIENT_UNIQUE));
        }

        Schema::create('patient_relationships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('barangay_health_center_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('patient_id');
            $table->unsignedBigInteger('relative_id');
            $table->string('type', 20);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['patient_id', 'relative_id']);
            $table->index('relative_id');
            $table->foreign(['patient_id', 'barangay_health_center_id'])->references(['id', 'barangay_health_center_id'])->on('patients')->restrictOnDelete();
            $table->foreign(['relative_id', 'barangay_health_center_id'])->references(['id', 'barangay_health_center_id'])->on('patients')->restrictOnDelete();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE patient_relationships ENABLE ROW LEVEL SECURITY');
            DB::statement('ALTER TABLE patient_relationships ADD CONSTRAINT patient_relationships_canonical CHECK (patient_id < relative_id)');
            DB::statement("ALTER TABLE patient_relationships ADD CONSTRAINT patient_relationships_type CHECK (type IN ('spouse', 'sibling'))");
        } elseif (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::unprepared("CREATE TRIGGER patient_relationships_rules_{$event} BEFORE {$event} ON patient_relationships WHEN NEW.patient_id >= NEW.relative_id OR NEW.type NOT IN ('spouse', 'sibling') BEGIN SELECT RAISE(ABORT, 'Invalid patient relationship'); END");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            foreach (['INSERT', 'UPDATE'] as $event) {
                DB::statement("DROP TRIGGER IF EXISTS patient_relationships_rules_{$event}");
            }
        }
        Schema::dropIfExists('patient_relationships');
        if (collect(Schema::getIndexes('patients'))->contains(fn ($index) => $index['name'] === self::PATIENT_UNIQUE)) {
            Schema::table('patients', fn (Blueprint $table) => $table->dropUnique(self::PATIENT_UNIQUE));
        }
    }
};
