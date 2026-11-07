<?php

use App\Services\ClinicalDraftSlotPreflight;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (app(ClinicalDraftSlotPreflight::class)->conflicts() !== []) {
            throw new RuntimeException('Resolve existing active draft conflicts before applying this migration. Run php artisan health-record-drafts:preflight-slots --json. No drafts were changed.');
        }
        DB::statement("CREATE UNIQUE INDEX clinical_draft_active_bhc_patient ON health_record_drafts (barangay_health_center_id, patient_id) WHERE status = 'active' AND rural_health_unit_id IS NULL AND barangay_health_center_id IS NOT NULL");
        DB::statement("CREATE UNIQUE INDEX clinical_draft_active_rhu_visit ON health_record_drafts (rural_health_unit_id, rhu_visit_id) WHERE status = 'active' AND rural_health_unit_id IS NOT NULL AND rhu_visit_id IS NOT NULL");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS clinical_draft_active_bhc_patient');
        DB::statement('DROP INDEX IF EXISTS clinical_draft_active_rhu_visit');
    }
};
