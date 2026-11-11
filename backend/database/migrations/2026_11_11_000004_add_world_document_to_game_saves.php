<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A game-world document for saves made by the offline-first game.
 *
 * The structured game tables (game_clubs, game_players, contracts, transfers) are the target
 * shape for hosted play, but they do not model fixtures, tables, tactics or competitions yet.
 * A cloud save stores the client's own world document next to them, so one user can keep
 * several playthroughs on the server without changing the shared catalogue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_saves', function (Blueprint $table) {
            $table->jsonb('world')->nullable()->after('seed');
            $table->unsignedSmallInteger('world_version')->default(1)->after('world');
            $table->unsignedInteger('world_players')->nullable()->after('world_version');
            $table->string('world_club', 80)->nullable()->after('world_players');
            $table->boolean('is_cloud')->default(false)->after('world_club');
            $table->index(['user_id', 'is_cloud']);
        });
    }

    public function down(): void
    {
        Schema::table('game_saves', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'is_cloud']);
            $table->dropColumn(['world', 'world_version', 'world_players', 'world_club', 'is_cloud']);
        });
    }
};
