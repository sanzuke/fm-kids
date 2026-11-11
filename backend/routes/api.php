<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\GameSaveController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\PlayerController;
use App\Http\Controllers\Api\TransferMarketController;
use App\Http\Controllers\Api\TransferOfferController;
use Illuminate\Support\Facades\Route;

Route::get('health', HealthController::class);
Route::post('auth/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// The catalogue is read-only game data: the app fills a save's market from it before anyone
// signs in, so it is public. Signing in is only needed for a user's own saves and offers.
Route::middleware('throttle:120,1')->group(function () {
    Route::get('clubs', [PlayerController::class, 'clubs']);
    Route::get('players', [PlayerController::class, 'index']);
    Route::get('players/{player}', [PlayerController::class, 'show']);
});

Route::middleware('auth:sanctum')->group(function () {
    // game saves (only the owner's)
    Route::get('game-saves', [GameSaveController::class, 'index']);
    Route::post('game-saves', [GameSaveController::class, 'store']);

    Route::prefix('game-saves/{gameSave}')->middleware('can:view,gameSave')->group(function () {
        Route::get('players', [GameSaveController::class, 'players']);
        Route::get('world', [GameSaveController::class, 'showWorld']);
        Route::put('world', [GameSaveController::class, 'updateWorld']);
        Route::get('transfer-market', [TransferMarketController::class, 'index']);
        Route::get('transfer-market/{playerId}', [TransferMarketController::class, 'show'])->whereNumber('playerId');
        Route::get('transfer-offers', [TransferOfferController::class, 'index']);
        Route::post('transfer-offers', [TransferOfferController::class, 'store']);
        Route::post('transfer-listings', [TransferMarketController::class, 'storeListing']);
        Route::get('transfer-history', [TransferMarketController::class, 'history']);
    });

    Route::delete('game-saves/{gameSave}', [GameSaveController::class, 'destroy'])->middleware('can:view,gameSave');

    Route::post('transfer-offers/{offer}/accept', [TransferOfferController::class, 'accept']);
    Route::post('transfer-offers/{offer}/reject', [TransferOfferController::class, 'reject']);
    Route::post('transfer-offers/{offer}/counter', [TransferOfferController::class, 'counter']);
});
