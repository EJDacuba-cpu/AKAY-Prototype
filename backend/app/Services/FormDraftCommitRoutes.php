<?php

namespace App\Services;

use App\Models\FormDraft;
use Illuminate\Auth\Access\Response as AuthorizationResponse;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Request;
use ReflectionMethod;
use ReflectionNamedType;

/** Explicit route-to-form associations; never a generic request-body draft detector. */
class FormDraftCommitRoutes
{
    public function resolve(Request $request, FormDraft $draft): array
    {
        $routes = config('form_draft_commits.routes', []);
        $key = $request->method().' '.$request->route()->uri();
        $legacy = config('form_draft_commits.legacy_routes', []);
        foreach ([...($routes[$key] ?? []), ...($legacy[$key] ?? [])] as $definition) {
            if ($definition['form_type'] !== $draft->form_type || $definition['mode'] !== $draft->mode) {
                continue;
            }
            foreach ($definition['when'] ?? [] as $field => $expected) {
                if ($request->input($field) !== $expected) {
                    continue 2;
                }
            }
            $context = $this->context($request, $definition['context']);
            if ($context === $draft->context_key) {
                return [...$definition, 'context_key' => $context];
            }
        }
        abort(409, 'This unfinished form does not match the requested action or record.');
    }

    private function context(Request $request, string|array $context): ?string
    {
        if (is_string($context)) {
            return $context;
        }
        $value = isset($context['route']) ? $request->route($context['route']) : $request->input($context['body']);
        if (is_object($value) && method_exists($value, 'getKey')) {
            $value = $value->getKey();
        }
        if (! preg_match('/^[1-9][0-9]*$/D', (string) $value)) {
            return null;
        }

        return $context['prefix'].':'.$value;
    }

    /** Run current FormRequest authorization, without executing uniqueness/domain validation. */
    public function authorize(Request $request, FormDraft $draft, array $definition): void
    {
        $route = $request->route();
        $controller = $route->getControllerClass();
        if ($controller) {
            $action = $route->getAction('uses');
            $actionMethod = str_contains($action, '@') ? explode('@', $action, 2)[1] : '__invoke';
            $method = new ReflectionMethod($controller, $actionMethod);
            foreach ($method->getParameters() as $parameter) {
                $type = $parameter->getType();
                if (! $type instanceof ReflectionNamedType || $type->isBuiltin()) {
                    continue;
                }
                $class = $type->getName();
                if (! is_subclass_of($class, FormRequest::class)) {
                    continue;
                }
                // Construct without resolving ValidatesWhenResolved from the container:
                // replay must not run validation before the original receipt is returned.
                $form = FormRequest::createFrom($request, new $class);
                $form->setContainer(app())->setRedirector(app('redirect'));
                if (method_exists($form, 'authorize')) {
                    $allowed = app()->call([$form, 'authorize']);
                    if ($allowed instanceof AuthorizationResponse) {
                        $allowed->authorize();
                    } else {
                        abort_unless($allowed, 403);
                    }
                }
            }
        }
        if (isset($definition['authorize'])) {
            [$class, $method] = $definition['authorize'];
            abort_if(app($class)->$method($request, $draft) === false, 403);
        }
    }
}
