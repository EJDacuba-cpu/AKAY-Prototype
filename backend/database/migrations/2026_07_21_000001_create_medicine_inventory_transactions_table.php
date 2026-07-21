<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->index();
            $table->timestamp('archived_at')->nullable()->index();
        });

        Schema::create('medicine_inventory_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medicine_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('transaction_type', 40);
            $table->integer('quantity_delta');
            $table->unsignedBigInteger('quantity_before');
            $table->unsignedBigInteger('quantity_after');
            $table->string('source_type', 40)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->text('reason')->nullable();
            $table->string('operation_key', 120);
            $table->timestamp('created_at')->useCurrent();

            $table->index(
                ['medicine_id', 'created_at'],
                'medicine_inventory_transactions_medicine_created_idx'
            );
            $table->index(
                ['actor_user_id', 'created_at'],
                'medicine_inventory_transactions_actor_created_idx'
            );
            $table->index(
                ['source_type', 'source_id'],
                'medicine_inventory_transactions_source_idx'
            );
            $table->unique(
                ['operation_key', 'medicine_id'],
                'medicine_inventory_transactions_operation_medicine_unique'
            );
        });

        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(<<<'SQL'
            ALTER TABLE public.medicines
            ADD CONSTRAINT medicines_exactly_one_facility
            CHECK (
                (barangay_health_center_id IS NOT NULL AND rural_health_unit_id IS NULL)
                OR (barangay_health_center_id IS NULL AND rural_health_unit_id IS NOT NULL)
            )
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.medicine_inventory_transactions
            ADD CONSTRAINT medicine_inventory_transactions_type_check
            CHECK (transaction_type IN (
                'opening_balance',
                'restock',
                'dispense',
                'adjustment_in',
                'adjustment_out',
                'damaged_disposal',
                'expired_disposal',
                'correction'
            ))
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.medicine_inventory_transactions
            ADD CONSTRAINT medicine_inventory_transactions_quantity_check
            CHECK (
                quantity_delta <> 0
                AND quantity_before >= 0
                AND quantity_after >= 0
                AND quantity_before + quantity_delta = quantity_after
            )
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.medicine_inventory_transactions
            ADD CONSTRAINT medicine_inventory_transactions_reason_check
            CHECK (
                transaction_type IN ('opening_balance', 'dispense')
                OR (reason IS NOT NULL AND btrim(reason) <> '')
            )
        SQL);
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement(
                'ALTER TABLE public.medicines DROP CONSTRAINT IF EXISTS medicines_exactly_one_facility'
            );
        }

        Schema::dropIfExists('medicine_inventory_transactions');

        Schema::table('medicines', function (Blueprint $table) {
            $table->dropColumn(['is_active', 'archived_at']);
        });
    }
};
