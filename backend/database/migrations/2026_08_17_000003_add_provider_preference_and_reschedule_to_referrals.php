<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Provider preference + Decision A trace (plan 3.5/3.7) and the No-Show
 * reschedule attributes (D-1 FINAL, consumed in Phase 4).
 *
 * Both groups land together because both are additive `referrals` changes with
 * the same akay_referral_json consequence - one migration avoids redefining
 * that stored function twice.
 *
 * Snapshots exist because a referral is a clinical-legal record (REL-01): if
 * the RHU later renames a provider or flips availability, the referral must
 * still show what the BHW saw at submission time. Mirrors the existing
 * medicine_name_snapshot pattern in health_record_medicines.
 *
 * referrals.preferred_doctor is retained and populated from the snapshot name
 * so the referral detail screens keep working unchanged.
 *
 * QRS-10 FINAL: none of these columns is read by any QR validity check.
 * rescheduled_to becoming populated is not an expiry trigger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('referrals', function (Blueprint $table): void {
            // Provider preference / Decision A (REF-SLIP-05c)
            $table->foreignId('preferred_provider_id')
                ->nullable()
                ->constrained('rhu_providers')
                ->nullOnDelete();
            $table->jsonb('preferred_provider_snapshot')->nullable();
            $table->jsonb('availability_snapshot')->nullable();
            $table->timestamp('preference_acknowledged_at')->nullable();

            // Rescheduling, No-Show only (D-1 FINAL). Columns land here; the
            // endpoint is Phase 4. rescheduled_to is caller-supplied ONLY
            // (DOC-14b) - no server default is set here or anywhere.
            $table->timestamp('rescheduled_to')->nullable();
            $table->text('reschedule_reason')->nullable();
            $table->foreignId('rescheduled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rescheduled_at')->nullable();
        });

        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_referral_json(r referrals, p_include_updates boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', r.id,
        'tracking_id', r.tracking_id,
        'qr_code_value', r.qr_code_value,
        'patient_id', r.patient_id,
        'health_record_id', r.health_record_id,
        'barangay_health_center_id', r.barangay_health_center_id,
        'rural_health_unit_id', r.rural_health_unit_id,
        'created_by', r.created_by,
        'referral_category', r.referral_category,
        'urgency_level', r.urgency_level,
        'reason_for_referral', r.reason_for_referral,
        'chief_complaint', r.chief_complaint,
        'initial_diagnosis', r.initial_diagnosis,
        'initial_action_taken', r.initial_action_taken,
        'referring_practitioner', r.referring_practitioner,
        'preferred_doctor', r.preferred_doctor,
        'preferred_provider_id', r.preferred_provider_id,
        'preferred_provider_snapshot', r.preferred_provider_snapshot,
        'availability_snapshot', r.availability_snapshot,
        'preference_acknowledged_at', r.preference_acknowledged_at,
        'rescheduled_to', r.rescheduled_to,
        'reschedule_reason', r.reschedule_reason,
        'rescheduled_by', r.rescheduled_by,
        'rescheduled_at', r.rescheduled_at,
        'referral_datetime', r.referral_datetime,
        'status', r.status,
        'remarks', r.remarks,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'patient', akay_patient_json(p),
        'health_record', CASE WHEN hr.id IS NULL THEN NULL ELSE akay_health_record_json(hr) END,
        'barangay_health_center', CASE WHEN bhc.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bhc.id,
            'name', bhc.name,
            'barangay', bhc.barangay,
            'address', bhc.address,
            'contact_information', bhc.contact_information,
            'status', bhc.status
        ) END,
        'rural_health_unit', CASE WHEN rhu.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', rhu.id,
            'name', rhu.name,
            'address', rhu.address,
            'contact_information', rhu.contact_information,
            'status', rhu.status
        ) END,
        'feedback', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', f.id,
            'referral_id', f.referral_id,
            'received_at', f.received_at,
            'rhu_diagnosis', f.rhu_diagnosis,
            'action_taken', f.action_taken,
            'treatment_notes', f.treatment_notes,
            'recommendation', f.recommendation,
            'receiving_practitioner', f.receiving_practitioner,
            'remarks', f.remarks,
            'created_by', f.created_by,
            'created_at', f.created_at,
            'updated_at', f.updated_at
        ) END,
        'updates', CASE WHEN p_include_updates THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ru.id,
                'referral_id', ru.referral_id,
                'user_id', ru.user_id,
                'previous_status', ru.previous_status,
                'status', ru.status,
                'remarks', ru.remarks,
                'created_at', ru.created_at,
                'updated_at', ru.updated_at,
                'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', u.id,
                    'name', u.name,
                    'email', u.email,
                    'role', u.role,
                    'status', u.status
                ) END
            ) ORDER BY ru.created_at ASC, ru.id ASC)
            FROM referral_updates ru
            LEFT JOIN users u ON u.id = ru.user_id
            WHERE ru.referral_id = r.id
        ), '[]'::jsonb) ELSE NULL END
    )
    FROM patients p
    LEFT JOIN health_records hr ON hr.id = r.health_record_id
    LEFT JOIN barangay_health_centers bhc ON bhc.id = r.barangay_health_center_id
    LEFT JOIN rural_health_units rhu ON rhu.id = r.rural_health_unit_id
    LEFT JOIN feedback f ON f.referral_id = r.id
    WHERE p.id = r.patient_id
$$;
SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared(<<<'SQL'
CREATE OR REPLACE FUNCTION akay_referral_json(r referrals, p_include_updates boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'id', r.id,
        'tracking_id', r.tracking_id,
        'qr_code_value', r.qr_code_value,
        'patient_id', r.patient_id,
        'health_record_id', r.health_record_id,
        'barangay_health_center_id', r.barangay_health_center_id,
        'rural_health_unit_id', r.rural_health_unit_id,
        'created_by', r.created_by,
        'referral_category', r.referral_category,
        'urgency_level', r.urgency_level,
        'reason_for_referral', r.reason_for_referral,
        'chief_complaint', r.chief_complaint,
        'initial_diagnosis', r.initial_diagnosis,
        'initial_action_taken', r.initial_action_taken,
        'referring_practitioner', r.referring_practitioner,
        'preferred_doctor', r.preferred_doctor,
        'referral_datetime', r.referral_datetime,
        'status', r.status,
        'remarks', r.remarks,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'patient', akay_patient_json(p),
        'health_record', CASE WHEN hr.id IS NULL THEN NULL ELSE akay_health_record_json(hr) END,
        'barangay_health_center', CASE WHEN bhc.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', bhc.id,
            'name', bhc.name,
            'barangay', bhc.barangay,
            'address', bhc.address,
            'contact_information', bhc.contact_information,
            'status', bhc.status
        ) END,
        'rural_health_unit', CASE WHEN rhu.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', rhu.id,
            'name', rhu.name,
            'address', rhu.address,
            'contact_information', rhu.contact_information,
            'status', rhu.status
        ) END,
        'feedback', CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', f.id,
            'referral_id', f.referral_id,
            'received_at', f.received_at,
            'rhu_diagnosis', f.rhu_diagnosis,
            'action_taken', f.action_taken,
            'treatment_notes', f.treatment_notes,
            'recommendation', f.recommendation,
            'receiving_practitioner', f.receiving_practitioner,
            'remarks', f.remarks,
            'created_by', f.created_by,
            'created_at', f.created_at,
            'updated_at', f.updated_at
        ) END,
        'updates', CASE WHEN p_include_updates THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ru.id,
                'referral_id', ru.referral_id,
                'user_id', ru.user_id,
                'previous_status', ru.previous_status,
                'status', ru.status,
                'remarks', ru.remarks,
                'created_at', ru.created_at,
                'updated_at', ru.updated_at,
                'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', u.id,
                    'name', u.name,
                    'email', u.email,
                    'role', u.role,
                    'status', u.status
                ) END
            ) ORDER BY ru.created_at ASC, ru.id ASC)
            FROM referral_updates ru
            LEFT JOIN users u ON u.id = ru.user_id
            WHERE ru.referral_id = r.id
        ), '[]'::jsonb) ELSE NULL END
    )
    FROM patients p
    LEFT JOIN health_records hr ON hr.id = r.health_record_id
    LEFT JOIN barangay_health_centers bhc ON bhc.id = r.barangay_health_center_id
    LEFT JOIN rural_health_units rhu ON rhu.id = r.rural_health_unit_id
    LEFT JOIN feedback f ON f.referral_id = r.id
    WHERE p.id = r.patient_id
$$;
SQL);
        }

        Schema::table('referrals', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('preferred_provider_id');
            $table->dropConstrainedForeignId('rescheduled_by');
            $table->dropColumn([
                'preferred_provider_snapshot',
                'availability_snapshot',
                'preference_acknowledged_at',
                'rescheduled_to',
                'reschedule_reason',
                'rescheduled_at',
            ]);
        });
    }
};
