<?php

namespace Tests\Unit\Services;

use App\Services\LaboratoryAttachmentStorage;
use Tests\TestCase;

class LaboratoryStorageConfigurationTest extends TestCase
{
    private function privateS3(): array
    {
        // Synthetic test configuration only; no provider is contacted.
        return ['driver' => 's3', 'key' => 'synthetic-test-key', 'secret' => 'synthetic-test-secret',
            'region' => 'us-east-1', 'bucket' => 'private-test-bucket', 'endpoint' => null,
            'visibility' => 'private', 'use_path_style_endpoint' => false, 'throw' => true];
    }

    public function test_configured_aws_and_https_compatible_endpoints_are_accepted(): void
    {
        config(['laboratory.disk' => 's3', 'filesystems.disks.s3' => $this->privateS3()]);
        $storage = app(LaboratoryAttachmentStorage::class);
        $this->assertTrue($storage->ready());
        $this->assertSame('s3', $storage->ensureReady());
        config(['filesystems.disks.s3.endpoint' => 'https://objects.example.test',
            'filesystems.disks.s3.use_path_style_endpoint' => true]);
        $this->assertTrue($storage->ready());
    }

    public function test_each_required_s3_setting_must_be_supplied(): void
    {
        foreach (['key', 'secret', 'region', 'bucket'] as $setting) {
            config(['laboratory.disk' => 's3', 'filesystems.disks.s3' => [...$this->privateS3(), $setting => '']]);
            $this->assertFalse(app(LaboratoryAttachmentStorage::class)->ready(), "Missing {$setting} must block uploads.");
        }
    }

    public function test_missing_local_public_and_insecure_storage_are_refused(): void
    {
        foreach ([null, 'local', 'public', 'unknown-disk'] as $disk) {
            config(['laboratory.disk' => $disk]);
            $this->assertFalse(app(LaboratoryAttachmentStorage::class)->ready());
        }
        config(['laboratory.disk' => 's3', 'filesystems.disks.s3' => [...$this->privateS3(), 'visibility' => 'public']]);
        $this->assertFalse(app(LaboratoryAttachmentStorage::class)->ready());
        foreach (['http://objects.example.test', 'invalid endpoint'] as $endpoint) {
            config(['filesystems.disks.s3' => [...$this->privateS3(), 'endpoint' => $endpoint]]);
            $this->assertFalse(app(LaboratoryAttachmentStorage::class)->ready());
        }
    }
}
