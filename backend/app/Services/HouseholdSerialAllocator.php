<?php

namespace App\Services;

use App\Models\Household;
use App\Models\Patient;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HouseholdSerialAllocator
{
    public function lock(int $bhc): void
    {
        // Auto allocation and manual overrides share this transaction-scoped lock.
        if (DB::getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(72419, ?::integer)', [$bhc]);
        }
    }

    public function occupied(int $bhc, string $serial, ?int $except = null): bool
    {
        return Household::where('barangay_health_center_id', $bhc)->when($except, fn ($q) => $q->whereKeyNot($except))->where('serial_number', $serial)->exists()
            || Patient::where('barangay_health_center_id', $bhc)->whereNull('household_id')->whereRaw('UPPER(TRIM(family_serial_number)) = ?', [$serial])->exists();
    }

    public function manual(int $bhc, string $value, string $field, ?int $except = null): string
    {
        $this->lock($bhc);
        $serial = mb_strtoupper(trim($value));
        if ($serial === '' || mb_strlen($serial) > 100 || preg_match('/[\p{C}]/u', $serial)) {
            throw ValidationException::withMessages([$field => 'Enter 1–100 printable characters.']);
        }
        if ($this->occupied($bhc, $serial, $except)) {
            throw ValidationException::withMessages([$field => 'This FSN is already used by a household or an unreconciled legacy patient in this BHC.']);
        }
        if (preg_match('/^FSN-(\d{4})-(\d{4,})$/', $serial, $match)) {
            if (strlen(ltrim($match[2], '0')) > 15) {
                throw ValidationException::withMessages([$field => 'The numeric FSN sequence is too large.']);
            }
            $this->counter($bhc, (int) $match[1], (int) $match[2]);
        }

        return $serial;
    }

    public function allocate(int $bhc): string
    {
        $year = now('Asia/Manila')->year;
        if (DB::getDriverName() === 'pgsql') {
            return DB::selectOne('SELECT akay_allocate_household_fsn(?, ?) AS serial', [$bhc, $year])->serial;
        }
        // SQLite is used for isolated tests; production PostgreSQL uses the function above.
        do {
            $number = $this->counter($bhc, $year) + 1;
            $this->counter($bhc, $year, $number);
            $serial = sprintf('FSN-%d-%04d', $year, $number);
        } while ($this->occupied($bhc, $serial));

        return $serial;
    }

    private function counter(int $bhc, int $year, ?int $advance = null): int
    {
        DB::table('household_fsn_counters')->insertOrIgnore(['barangay_health_center_id' => $bhc, 'year' => $year, 'last_number' => 0]);
        $query = DB::table('household_fsn_counters')->where('barangay_health_center_id', $bhc)->where('year', $year);
        $number = (int) $query->lockForUpdate()->value('last_number');
        if ($advance !== null && $advance > $number) {
            $query->update(['last_number' => $advance]);

            return $advance;
        }

        return $number;
    }
}
