<?php

namespace App\Http\Middleware;

use App\Services\FormDraftCommit;
use App\Services\FormDraftCommitRoutes;
use App\Services\FormDraftService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Must follow authentication, working-facility and action middleware. */
class CommitFormDraft
{
    public function __construct(
        private readonly FormDraftCommit $commit,
        private readonly FormDraftCommitRoutes $routes,
        private readonly FormDraftService $drafts,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $metadata = $this->commit->metadata($request);
        if ($metadata === null) {
            return $next($request);
        }
        abort_unless($request->user(), 401);
        $draft = $this->drafts->find($request->user(), $metadata['id']);
        $definition = $this->routes->resolve($request, $draft);

        return $this->commit->run(
            $request, $definition['form_type'], $definition['mode'], $definition['context_key'],
            $request->all(), fn () => $next($request),
            fn () => $this->routes->authorize($request, $draft, $definition),
        );
    }
}
