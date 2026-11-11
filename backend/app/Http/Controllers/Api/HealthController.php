<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/** A public "is the game server there?" check the client uses before asking anyone to sign in. */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');
            $database = 'ok';
        } catch (Throwable) {
            $database = 'unavailable';
        }

        return response()->json([
            'data' => [
                'status' => $database === 'ok' ? 'ok' : 'degraded',
                'database' => $database,
                'version' => config('app.version', '1'),
            ],
        ], $database === 'ok' ? 200 : 503);
    }
}
