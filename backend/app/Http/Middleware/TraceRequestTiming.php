<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Local-only diagnostic for requests that hang. Writes a line when a request
 * starts, before and after every query, and when the request ends, so a
 * stuck request shows up as a "start" with no matching "done".
 *
 * SQL is logged without its bindings and paths without their query string,
 * so no patient data reaches the log. The first query of a request includes
 * the time spent opening the database connection.
 */
class TraceRequestTiming
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! app()->isLocal() || ! config('operations.request_trace.enabled')) {
            return $next($request);
        }

        $log = Log::channel('request_trace');
        $id = bin2hex(random_bytes(3));
        $startedAt = hrtime(true);
        $queries = 0;
        $queryMs = 0.0;

        DB::beforeExecuting(function (string $sql) use ($log, $id, &$queries) {
            $queries++;
            $log->info("[{$id}] query #{$queries} start", ['sql' => $this->sql($sql)]);
        });
        DB::listen(function (QueryExecuted $query) use ($log, $id, &$queries, &$queryMs) {
            $queryMs += $query->time;
            $log->info("[{$id}] query #{$queries} done", ['ms' => round($query->time, 1)]);
        });

        $log->info("[{$id}] request start", ['method' => $request->method(), 'path' => '/'.$request->path()]);

        $response = $next($request);

        $log->info("[{$id}] request done", [
            'status' => $response->getStatusCode(),
            'ms' => round((hrtime(true) - $startedAt) / 1e6, 1),
            'queries' => $queries,
            'query_ms' => round($queryMs, 1),
        ]);

        return $response;
    }

    private function sql(string $sql): string
    {
        return mb_strimwidth(preg_replace('/\s+/', ' ', $sql), 0, 200, '...');
    }
}
