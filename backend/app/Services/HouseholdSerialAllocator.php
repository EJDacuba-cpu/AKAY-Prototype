<?php

namespace App\Services;

use App\Models\Household;
use App\Models\Patient;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class HouseholdSerialAllocator
{
    public function lock(HouseholdOwner $owner): void
    {
        // Auto allocation and manual overrides share this transaction-scoped lock.
        if (DB::getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(?, ?::integer)', [$owner->lockClass(), $owner->id]);
        }
    }

    public function occupied(HouseholdOwner $owner, string $serial, ?int $except = null): bool
    {
        $households = $owner->scopeHouseholds(Household::query())->when($except, fn ($q) => $q->whereKeyNot($except))->where('serial_number', $serial)->exists();
        $legacy = $owner->isBhc()
            ? Patient::where('barangay_health_center_id', $owner->id)->whereNull('household_id')->whereRaw('UPPER(TRIM(family_serial_number)) = ?', [$serial])->exists()
            : Patient::where('rural_health_unit_id', $owner->id)->whereNull('household_id')->whereRaw('UPPER(TRIM(family_serial_number)) = ?', [$serial])->exists();

        return $households || $legacy;
    }

    public function manual(HouseholdOwner $owner, string $value, string $field, ?int $except = null): string
    {
        $this->lock($owner);
        $serial = mb_strtoupper(trim($value));
        if ($serial === '' || mb_strlen($serial) > 100 || preg_match('/[\p{C}]/u', $serial)) {
            throw ValidationException::withMessages([$field => 'Enter 1–100 printable characters.']);
        }
        if ($this->occupied($owner, $serial, $except)) {
            throw ValidationException::withMessages([$field => 'This FSN is already used by a household or an unreconciled legacy patient in this facility.']);
        }
        if (preg_match('/^FSN-(\d{4})-(\d{4,})$/', $serial, $match)) {
            if (strlen(ltrim($match[2], '0')) > 15) {
                throw ValidationException::withMessages([$field => 'The numeric FSN sequence is too large.']);
            }
            $this->counter($owner, (int) $match[1], (int) $match[2]);
        }

        return $serial;
    }

    public function allocate(HouseholdOwner $owner): string
    {
        $year = now('Asia/Manila')->year;
        if (DB::getDriverName() === 'pgsql') {
            $function = $owner->isBhc() ? 'akay_allocate_household_fsn' : 'akay_allocate_rhu_household_fsn';

            return DB::selectOne("SELECT {$function}(?, ?) AS serial", [$owner->id, $year])->serial;
        }
        // SQLite is used for isolated tests; production PostgreSQL uses the function above.
        do {
            $number = $this->counter($owner, $year) + 1;
            $this->counter($owner, $year, $number);
            $serial = sprintf('FSN-%d-%04d', $year, $number);
        } while ($this->occupied($owner, $serial));

        return $serial;
    }

    private function counter(HouseholdOwner $owner, int $year, ?int $advance = null): int
    {
        DB::table('household_fsn_counters')->insertOrIgnore([...$owner->attributes(), 'year' => $year, 'last_number' => 0]);
        $query = DB::table('household_fsn_counters')->where('year', $year);
        $query = $owner->isBhc()
            ? $query->where('barangay_health_center_id', $owner->id)
            : $query->where('rural_health_unit_id', $owner->id);
        $number = (int) $query->lockForUpdate()->value('last_number');
        if ($advance !== null && $advance > $number) {
            $query->update(['last_number' => $advance]);

            return $advance;
        }

        return $number;
    }
}
