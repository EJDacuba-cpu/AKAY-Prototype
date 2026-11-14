<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pending inventory reconciliation for clinically documented RHU service items
 * (EPI vaccines already given, Maternal/FP/Nutrition supplies actually used).
 * Stock is deducted only when an authorized dispenser confirms — never on
 * consultation finalize. Separate from diagnosis-linked prescriptions /
 * health_record_medicines.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rhu_service_usage_reconciliations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('health_record_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->cascadeOnDelete();
            $table->string('service_program', 64);
            $table->string('clinical_source_key', 191);
            $table->string('item_description', 255);
            $table->unsignedInteger('quantity');
            $table->string('unit', 50);
            $table->date('administered_at')->nullable();
            $table->string('note', 2000)->nullable();
            $table->string('reconciliation_status', 32)->default('pending');
            $table->foreignId('inventory_medicine_id')->nullable()->constrained('medicines')->nullOnDelete();
            $table->unsignedBigInteger('inventory_transaction_id')->nullable();
            $table->unsignedBigInteger('expiry_group_id')->nullable();
            $table->unsignedInteger('reconciled_quantity')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['health_record_id', 'clinical_source_key'],
                'rhu_service_usage_source_unique'
            );
            $table->index(
                ['rural_health_unit_id', 'reconciliation_status'],
                'rhu_service_usage_rhu_status_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rhu_service_usage_reconciliations');
    }
};
