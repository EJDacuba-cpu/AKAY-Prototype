<?php

namespace App\Services;

use App\Models\LaboratoryAttachment;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\AwsS3V3\AwsS3V3Adapter;

class LaboratoryAttachmentStorage
{
    public function ready(): bool
    {
        $disk = config('laboratory.disk');
        $config = $disk ? config("filesystems.disks.$disk") : null;

        return is_array($config) && ($config['driver'] ?? null) === 's3'
            && collect(['key', 'secret', 'region', 'bucket'])->every(fn ($key) => filled($config[$key] ?? null))
            && ($config['visibility'] ?? 'private') === 'private'
            && (blank($config['endpoint'] ?? null)
                || (filter_var($config['endpoint'], FILTER_VALIDATE_URL)
                    && parse_url($config['endpoint'], PHP_URL_SCHEME) === 'https'))
            && class_exists(AwsS3V3Adapter::class);
    }

    public function ensureReady(): string
    {
        abort_unless($this->ready(), 503, 'Laboratory uploads require configured durable private storage. Contact your administrator.');

        return config('laboratory.disk');
    }

    public function purge(LaboratoryAttachment $attachment): void
    {
        // Finalized files remain durable evidence, including versions already
        // shared. Removing one withdraws it from the current laboratory view.
        if ($attachment->health_record_id || $attachment->purged_at) {
            return;
        }
        if (Storage::disk($attachment->disk)->delete($attachment->path)) {
            $attachment->update(['purged_at' => now()]);
        }
    }
}
