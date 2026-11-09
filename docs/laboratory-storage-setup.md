# Private laboratory attachment storage

This setup enables the existing laboratory upload and authorized streaming flow. It adds no provider, dependencies, schema, UI, or clinical workflow. Existing attachment rows retain their storage disk and object path; no URLs are saved in the database.

## Settings to supply

Set these on the **backend only**. Blank credential/bucket entries are placeholders and deliberately keep uploads disabled until filled.

```dotenv
LABORATORY_FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=
AWS_BUCKET=
AWS_ENDPOINT=
AWS_USE_PATH_STYLE_ENDPOINT=false
```

| Setting | AWS S3 | S3-compatible provider |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials permitted to access the private bucket | Provider-issued S3 API credentials |
| `AWS_DEFAULT_REGION` | Bucket's actual AWS region | Provider's required region value |
| `AWS_BUCKET` | Private bucket name | Private bucket name |
| `AWS_ENDPOINT` | Leave blank; AWS regional endpoint is selected | Provider's **HTTPS S3 API endpoint**, not a public/CDN URL |
| `AWS_USE_PATH_STYLE_ENDPOINT` | Normally `false` | `true` or `false` as required by that provider |

Use a private bucket with anonymous/public access disabled. For AWS, retain Block Public Access and Bucket owner enforced; do not enable public ACLs. The upload implementation omits object ACL headers, supporting policy-based AWS buckets and compatible providers that do not implement ACLs. Bucket policy must enforce privacy. Give the backend credential only the required object read/write/delete permissions for `laboratory/*`; deletion supports cleanup of failed/staged uploads. Any provider encryption or additional permissions must be configured according to that provider's requirements.

Do not set `AWS_URL` to a public clinical-document URL. Do not put credentials into `frontend/.env`, `VITE_*` variables, source code, screenshots, or committed files. Backend `.env` is Git-ignored and excluded from Docker builds. Render values belong to the backend service, not the frontend service.

## Local backend

1. Open the existing `backend/.env`; do not replace it with `.env.example` or overwrite other settings.
2. Fill the missing storage values above. `LABORATORY_FILESYSTEM_DISK=s3` is selected in this workspace. Existing AWS values have been preserved; no credentials were invented.
3. From `backend`, run:

   ```powershell
   php artisan config:clear
   ```

4. Restart the backend process. For `php artisan serve`, stop that process and start it again with the same host/port options previously used. Keep the frontend running; no frontend storage settings are required.
5. If this environment intentionally uses Laravel's configuration cache, run `php artisan config:cache` **after** supplying the final values. Repeat clear/cache and restart whenever settings change. Do not cache the missing placeholder values and assume uploads are enabled.

Other local PHP installations must allow the existing 10 MiB per-file upload limit and multipart overhead. The existing backend Docker configuration already sets `upload_max_filesize=10M` and `post_max_size=12M`.

## Render backend Environment

1. Open the existing **backend web service** in Render, then its **Environment** settings.
2. Add/update the eight keys above with the actual private bucket credentials, region, endpoint, and addressing mode. For AWS, omit the endpoint or leave it blank. Do not change the application's general `FILESYSTEM_DISK` to local as a workaround; laboratory uploads use their explicitly selected S3 disk.
3. Choose **Save, rebuild, and deploy** after the reviewed source changes are available to that service. This loads the changed code and environment. Saving without deploying does not activate the new values. A plain restart uses the environment values from the current deployment, so it is not a substitute for deploying newly saved values.
4. If an existing Laravel configuration cache is present, open the backend service Shell and run:

   ```sh
   cd /var/www/html
   php artisan config:clear
   ```

   `/var/www/html` is this repository's backend Docker working directory. Adjust it only if the service uses a different runtime. For an environment that intentionally caches configuration, run `php artisan config:cache` there after clearing. Create any configuration cache at runtime with the actual service environment, not in a distributable image containing credentials.
5. Restart the backend service after clearing/rebuilding an existing cache. If there is no configuration cache, the completed rebuild/deploy already starts fresh backend processes. Restart any separate long-running workers if that deployment uses them.
6. Keep the existing Laravel scheduler running for staged attachment cleanup. No database migration or additional package installation is needed for this storage configuration change.

This task does not modify Render settings or deploy the service. Maintain the same disk alias and bucket/object access across restarts; repointing `s3` to a different bucket does not move existing files.

## Verification after credentials are supplied

Use an authorized synthetic/test consultation, not a new real clinical record solely for testing:

1. Sign in as permitted RHU staff and upload a small synthetic PDF/PNG/JPEG. Confirm success and that preview returns the same content.
2. Resume that saved draft and preview the same attachment. Its database metadata should contain `disk=s3` and the generated `laboratory/...` object path, with no public/signed URL.
3. An unauthenticated request to the attachment API must be denied. An authenticated user without the required patient/facility/handoff authorization must receive a denial before the backend accesses object storage. Never share an authorization token to perform this check.
4. Confirm anonymous/direct object access is denied by the provider's bucket policy, while authorized backend preview succeeds. Backend uploads succeeding alone does **not** prove the bucket is private.
5. Confirm text results and draft recovery remain intact if the storage provider is unavailable. The backend returns a clear 503 error and never falls back to local storage. Failed uploads are cleaned up or retained as tracked cleanup intents.

Code checks exercise the real installed Laravel/Flysystem/AWS driver through an isolated HTTP transport, including AWS regional/virtual-host and compatible HTTPS/path-style addressing, ACL-free writes, authorized/denied retrieval, configuration failures, provider errors, and draft preservation. They use synthetic test configuration and do not contact a live provider.

Run from `backend`:

```powershell
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/phpunit --filter="LaboratoryStorageConfigurationTest|UniversalLaboratoryTest|MonitoringHandoffTest|RhuItrConsultationTest|HealthRecordDraftTest" --no-progress
```

The `-d` flags enable the installed SQLite extensions only for this workstation's isolated test process; omit them when SQLite is already enabled. The test database is in memory.

## Files changed for this storage task

| File | Why |
| --- | --- |
| `backend/.env` (ignored) | Select the existing `s3` laboratory disk and add missing blank placeholders; preserve all existing credentials/settings |
| `backend/.env.example` | Include all eight backend-only settings and provider endpoint/addressing comments |
| `backend/config/filesystems.php` | Explicit private visibility, exception-enabled S3 storage, and blank-to-default endpoint normalization; retain configurable endpoint/path-style behavior |
| `backend/app/Services/LaboratoryAttachmentStorage.php` | Refuse missing credentials/region/bucket, local/public disks, and insecure/custom endpoints without connecting to a provider |
| `backend/app/Http/Controllers/Api/LaboratoryAttachmentController.php` | Make ACL-free private-bucket uploads compatible with AWS/providers; return clear storage errors in production; preserve permissions, validation, metadata, and cleanup |
| `backend/tests/Unit/Services/LaboratoryStorageConfigurationTest.php` | Verify configuration gating and HTTPS/private disk requirements |
| `backend/tests/Feature/UniversalLaboratoryTest.php` | Extend existing checks with actual S3 driver requests through a mock transport, denied retrieval, and production failure/draft preservation |
| `docs/laboratory-storage-setup.md` | Document exact local/Render configuration, verification, remaining settings, and changed files |

No frontend files, dependencies, database schema, or clinical records were changed by this storage task. Existing uncommitted feature work was preserved.

## Current verification status

The local bucket, access key, and secret key are still missing. A region value already exists and must match the selected provider/bucket. The endpoint is optional for AWS and required when using another provider. Live storage upload/retrieval and the bucket's privacy policy therefore remain **unverified**; configuring the disk does not certify connectivity or privacy.

Actual checks for this change: **82 backend tests passed, 694 assertions**, including 25 focused storage/laboratory tests. Targeted PHP formatting and `git diff --check` passed. The local Laravel configuration cache was cleared. Runtime configuration was inspected without printing credentials: laboratory disk `s3`, private visibility, AWS default endpoint, path-style disabled, and uploads correctly blocked by missing `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_BUCKET`. No backend process was restarted and no Render deployment was performed.

## Official references

- [Laravel filesystem and S3-compatible configuration](https://laravel.com/framework/docs/13.x/filesystem)
- [AWS S3 Object Ownership and disabled ACLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [Render Environment Variables and Secrets](https://render.com/docs/configure-environment-variables)
- [Render deploy and restart behavior](https://render.com/docs/deploys)
