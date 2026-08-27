<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A referral submission blocked by DOC-14 (zero available providers at the
 * receiving RHU). Recorded so the BHW is notified when a provider there
 * becomes available again, without inventing a "Blocked" referrals row or
 * TRK-02 status - the referral was never created, so it has no TRK-02 state
 * to be in.
 *
 * This table is written to ONLY after ReferralSubmissionGate::assertCanSubmit()
 * has already thrown NO_PROVIDER_AVAILABLE and that transaction has rolled
 * back. It never participates in the gate decision itself (DOC-14 stays a
 * live, uncached check) and is not read by ReferralSubmissionGate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('referral_holds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('barangay_health_center_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rural_health_unit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            // Intent, not payload: enough to prefill the referral form and to
            // show the BHW what they were trying to send. No clinical text.
            $table->foreignId('health_record_id')->nullable()->constrained()->nullOnDelete();
            $table->string('urgency_level')->nullable();
            $table->foreignId('preferred_provider_id')->nullable()
                ->constrained('rhu_providers')->nullOnDelete();

            $table->string('status')->default('waiting'); // waiting|resubmitted|discarded|expired
            $table->timestamp('last_notified_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('resolved_referral_id')->nullable()
                ->constrained('referrals')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['rural_health_unit_id', 'status'],
                'referral_holds_rhu_status_idx'
            );
            $table->index(
                ['created_by', 'status'],
                'referral_holds_creator_status_idx'
            );
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement(
            'ALTER TABLE public.referral_holds ADD CONSTRAINT referral_holds_status_check '
            ."CHECK (status IN ('waiting', 'resubmitted', 'discarded', 'expired'))"
        );

        // Phase 2B posture (docs/database-exposure-containment.md): every
        // table created after that migration ran must enable RLS itself.
        // Safe now for the same reason it is safe on rhu_providers - Laravel
        // connects as table owner, which PostgreSQL exempts from RLS.
        DB::statement('ALTER TABLE public.referral_holds ENABLE ROW LEVEL SECURITY');
    }

    public function down(): void
    {
        Schema::dropIfExists('referral_holds');
    }
};
