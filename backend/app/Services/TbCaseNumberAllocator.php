<?php

namespace App\Services;

use App\Models\TbTreatmentCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

/** Call inside the registration transaction; insert the case before committing. */
final class TbCaseNumberAllocator
{
    public function allocate(int $rhuId, int $year, ?string $supplied = null): string
    {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('TB number allocation and case insertion must share a transaction.');
        }
        if ($year < 1900 || $year > 9999) {
            throw ValidationException::withMessages(['reporting_year' => 'Enter a reporting year between 1900 and 9999.']);
        }
        $manual = $supplied !== null ? TbTreatmentCase::canonicalCaseNumber($supplied) : null;
        if ($supplied !== null && ($manual === '' || mb_strlen($manual) > 100 || preg_match('/[\p{C}]/u', $supplied) !== 0)) {
            throw ValidationException::withMessages(['case_number' => 'Enter 1–100 printable characters for the case number.']);
        }

        DB::table('tb_case_number_counters')->insertOrIgnore([
            'rural_health_unit_id' => $rhuId, 'reporting_year' => $year, 'last_number' => 0,
        ]);
        $counter = DB::table('tb_case_number_counters')->where('rural_health_unit_id', $rhuId)->where('reporting_year', $year);
        $last = (int) (clone $counter)->lockForUpdate()->value('last_number');
        $legacy = $this->legacyNumbers($rhuId);
        $occupied = fn (string $number): bool => isset($legacy[$number]) || TbTreatmentCase::query()
            ->where('rural_health_unit_id', $rhuId)->where('reporting_year', $year)
            ->whereRaw('UPPER(TRIM(case_number)) = ?', [$number])->exists();

        if ($manual !== null) {
            if ($occupied($manual)) {
                throw ValidationException::withMessages(['case_number' => 'This case number is already used in this RHU/reporting year or reserved by a legacy record.']);
            }

            return $manual;
        }

        do {
            if ($last >= PHP_INT_MAX - 1) {
                throw ValidationException::withMessages(['case_number' => 'The case-number sequence is exhausted.']);
            }
            $number = sprintf('TB-%d-%04d', $year, ++$last);
        } while ($occupied($number));
        $counter->update(['last_number' => $last]);

        return $number;
    }

    /** Legacy reporting years are unknown; reserve exact numbers without guessing. */
    private function legacyNumbers(int $rhuId): array
    {
        $records = DB::table('health_records')->whereNotNull('tb_data')
            ->where(function ($query) use ($rhuId) {
                $query->where('rural_health_unit_id', $rhuId)
                    ->orWhere(fn ($bhc) => $bhc->whereNull('rural_health_unit_id')
                        ->whereIn('barangay_health_center_id', DB::table('barangay_health_centers')
                            ->select('id')->where('rural_health_unit_id', $rhuId)));
            })->select('tb_data->diagnosis->tbCaseNumber as legacy_number');
        $numbers = [];
        foreach ($records->cursor() as $record) {
            if (is_string($record->legacy_number)) {
                $number = TbTreatmentCase::canonicalCaseNumber($record->legacy_number);
                if ($number !== '') {
                    $numbers[$number] = true;
                }
            }
        }

        return $numbers;
    }
}
