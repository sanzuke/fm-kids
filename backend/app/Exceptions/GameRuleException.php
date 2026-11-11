<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A game rule refused the action (not enough money, window closed, player not yours...).
 * Rendered as {"message": ..., "code": ...}; $errorCode is a stable machine-readable reason.
 */
class GameRuleException extends RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['message' => $this->getMessage(), 'code' => $this->errorCode], $this->status);
    }

    /** A rule refusal is an expected outcome, not something to log. */
    public function report(): bool
    {
        return true;
    }
}
