<?php

namespace App\Support;

use InvalidArgumentException;

final class SecurityConfiguration
{
    /**
     * @return array<int, string>
     */
    public static function parseOrigins(?string ...$values): array
    {
        $origins = [];

        foreach (self::csvValues(...$values) as $origin) {
            if ($origin === '*' || str_contains($origin, '*')) {
                throw new InvalidArgumentException('AKAY allowed origins must not contain wildcards.');
            }

            $parts = parse_url($origin);
            $scheme = strtolower((string) ($parts['scheme'] ?? ''));
            $path = $parts['path'] ?? '';

            if (! in_array($scheme, ['http', 'https'], true)
                || empty($parts['host'])
                || isset($parts['user'])
                || isset($parts['pass'])
                || isset($parts['query'])
                || isset($parts['fragment'])
                || ($path !== '' && $path !== '/')) {
                throw new InvalidArgumentException("Invalid AKAY origin: {$origin}");
            }

            $normalized = $scheme.'://'.strtolower($parts['host']);

            if (isset($parts['port'])) {
                $normalized .= ':'.$parts['port'];
            }

            $origins[] = $normalized;
        }

        return array_values(array_unique($origins));
    }

    /**
     * Exact patterns prevent the CORS library's single-origin optimization from
     * adding an unrelated Allow-Origin value to untrusted requests.
     *
     * @param  array<int, string>  $origins
     * @return array<int, string>
     */
    public static function originPatterns(array $origins): array
    {
        return array_map(
            fn (string $origin): string => '#^'.preg_quote($origin, '#').'\z#Du',
            $origins
        );
    }

    /**
     * @return array<int, string>
     */
    public static function trustedHostPatterns(?string $hosts, ?string $appUrl): array
    {
        $values = self::csvValues($hosts);
        $appHost = parse_url((string) $appUrl, PHP_URL_HOST);

        if (is_string($appHost) && $appHost !== '') {
            $values[] = $appHost;
        }

        $patterns = [];

        foreach (array_unique($values) as $host) {
            $candidate = strtolower(trim($host));

            if (str_contains($candidate, '://')) {
                $candidate = (string) parse_url($candidate, PHP_URL_HOST);
            }

            if (! self::isValidHost($candidate)) {
                throw new InvalidArgumentException("Invalid AKAY trusted host: {$host}");
            }

            $patterns[] = '^'.preg_quote($candidate, '/').'$';
        }

        return array_values(array_unique($patterns));
    }

    /**
     * @return array<int, string>
     */
    public static function parseTrustedProxies(?string $value): array
    {
        $proxies = self::csvValues($value);

        foreach ($proxies as $proxy) {
            if ($proxy === '*' || $proxy === '**') {
                throw new InvalidArgumentException(
                    'AKAY_TRUSTED_PROXIES must list explicit IP/CIDR values or REMOTE_ADDR.'
                );
            }

            if ($proxy === 'REMOTE_ADDR') {
                continue;
            }

            [$address, $prefix] = array_pad(explode('/', $proxy, 2), 2, null);

            if (filter_var($address, FILTER_VALIDATE_IP) === false
                || ($prefix !== null && ! self::isValidCidrPrefix($address, $prefix))) {
                throw new InvalidArgumentException("Invalid AKAY trusted proxy: {$proxy}");
            }
        }

        return $proxies;
    }

    public static function originFromUrl(?string $url): ?string
    {
        if ($url === null || trim($url) === '') {
            return null;
        }

        return self::parseOrigins($url)[0] ?? null;
    }

    /**
     * @return array<int, string>
     */
    private static function csvValues(?string ...$values): array
    {
        $items = [];

        foreach ($values as $value) {
            foreach (explode(',', (string) $value) as $item) {
                $item = trim($item);

                if ($item !== '') {
                    $items[] = $item;
                }
            }
        }

        return array_values(array_unique($items));
    }

    private static function isValidHost(string $host): bool
    {
        if ($host === 'localhost' || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return true;
        }

        return filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    }

    private static function isValidCidrPrefix(string $address, string $prefix): bool
    {
        if (! ctype_digit($prefix)) {
            return false;
        }

        $maximum = filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) ? 128 : 32;

        return (int) $prefix >= 0 && (int) $prefix <= $maximum;
    }
}
