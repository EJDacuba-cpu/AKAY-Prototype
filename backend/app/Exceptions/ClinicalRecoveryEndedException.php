<?php

namespace App\Exceptions;

use Symfony\Component\HttpKernel\Exception\HttpException;

class ClinicalRecoveryEndedException extends HttpException
{
    public function __construct()
    {
        parent::__construct(409, 'This consultation recovery has already ended.');
    }

    public function render()
    {
        return response()->json(['code' => 'CLINICAL_RECOVERY_ENDED', 'message' => $this->getMessage()], 409);
    }
}
