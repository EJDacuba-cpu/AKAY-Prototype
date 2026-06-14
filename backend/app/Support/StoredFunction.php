<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StoredFunction
{
    public static function available(): bool
    {
        return DB::connection()->getDriverName() === 'pgsql';
    }

    public static function select(string $sql, array $bindings = []): array
    {
        return DB::select($sql, $bindings);
    }

    public static function selectJson(string $sql, array $bindings = []): ?array
    {
        $row = DB::selectOne($sql, $bindings);
        if (! $row) {
            return null;
        }

        $value = $row->data ?? $row->result ?? $row->payload ?? null;

        return self::decodeJson($value);
    }

    public static function paginatedResponse(array $rows, Request $request): array
    {
        $page = max(1, $request->integer('page', 1));
        $perPage = max(1, $request->integer('per_page', 25));
        $total = (int) ($rows[0]->total_count ?? 0);
        $items = array_map(
            fn ($row) => self::decodeJson($row->item ?? $row->payload ?? $row->data ?? null),
            $rows,
        );

        return [
            'data' => $items,
            'current_page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'last_page' => (int) max(1, ceil($total / $perPage)),
            'from' => $total === 0 ? null : (($page - 1) * $perPage) + 1,
            'to' => $total === 0 ? null : (($page - 1) * $perPage) + count($items),
        ];
    }

    private static function decodeJson(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        if (is_object($value)) {
            return json_decode(json_encode($value), true);
        }

        return json_decode((string) $value, true);
    }
}
