<?php

namespace App\Exceptions;

/** The request quota is used up; try again after $retryAfter seconds. */
class ApiRateLimitedException extends ApiFootballException
{
    public function __construct(public readonly int $retryAfter, string $message = 'API-Football rate limit reached.')
    {
        parent::__construct($message);
    }
}
