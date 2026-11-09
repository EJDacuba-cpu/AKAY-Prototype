<?php

return [
    // Must name an existing private S3-compatible disk. Local/public disks are
    // deliberately refused, including on Render. No credentials live here.
    'disk' => env('LABORATORY_FILESYSTEM_DISK'),
    'max_file_kb' => 10240,
    'max_files_per_test' => 10,
];
