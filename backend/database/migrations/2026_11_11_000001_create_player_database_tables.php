<?php

use App\Enums\Position;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Module 1: the shared player catalogue. Nothing here changes while a game is played;
 * each game save copies what it needs into the game_* tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        Schema::create('countries', function (Blueprint $table) {
            $table->id();
            $table->string('code', 3)->nullable()->unique();
            $table->string('name')->unique();
            $table->timestamps();
        });

        Schema::create('leagues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('country_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('tier')->default(1);
            $table->boolean('is_fictional')->default(false);
            $table->string('provider', 40)->nullable();
            $table->string('external_id', 64)->nullable();
            $table->timestamps();
            $table->unique(['provider', 'external_id']);
        });

        Schema::create('clubs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('league_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('country_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('short_name', 12)->nullable();
            $table->boolean('is_fictional')->default(false);
            $table->unsignedSmallInteger('reputation')->default(50);
            $table->string('primary_color', 9)->nullable();
            $table->string('secondary_color', 9)->nullable();
            $table->string('provider', 40)->nullable();
            $table->string('external_id', 64)->nullable();
            $table->timestamps();
            $table->unique(['provider', 'external_id']);
            $table->index('name');
        });
        DB::statement('ALTER TABLE clubs ADD CONSTRAINT clubs_reputation_range CHECK (reputation BETWEEN 1 AND 100)');

        Schema::create('players', function (Blueprint $table) {
            $table->id();
            $table->string('origin', 10);
            $table->string('name');
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->date('birth_date');
            $table->foreignId('country_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('club_id')->nullable()->constrained()->nullOnDelete();
            $table->string('primary_position', 3);
            $table->jsonb('secondary_positions')->default('[]');
            $table->string('preferred_foot', 5)->default('right');
            $table->string('personality', 20)->default('team_player');
            $table->unsignedSmallInteger('height_cm')->nullable();
            // starting values a new game save copies; a save's own values live in game_player_attributes
            $table->unsignedSmallInteger('base_overall');
            $table->unsignedSmallInteger('base_potential');
            $table->jsonb('base_attributes');
            $table->unsignedBigInteger('base_market_value');
            $table->unsignedBigInteger('base_wage');
            $table->timestamps();
            $table->index('origin');
            $table->index('primary_position');
            $table->index('base_overall');
            $table->index('birth_date');
        });
        $positions = Position::sqlList();
        DB::statement("ALTER TABLE players ADD CONSTRAINT players_origin_valid CHECK (origin IN ('real','fictional'))");
        DB::statement("ALTER TABLE players ADD CONSTRAINT players_position_valid CHECK (primary_position IN ($positions))");
        DB::statement("ALTER TABLE players ADD CONSTRAINT players_foot_valid CHECK (preferred_foot IN ('left','right','both'))");
        DB::statement('ALTER TABLE players ADD CONSTRAINT players_overall_range CHECK (base_overall BETWEEN 1 AND 99)');
        DB::statement('ALTER TABLE players ADD CONSTRAINT players_potential_range CHECK (base_potential BETWEEN base_overall AND 99)');
        DB::statement('CREATE INDEX players_name_trgm ON players USING gin (lower(name) gin_trgm_ops)');

        Schema::create('player_external_ids', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 40);
            $table->string('external_id', 64);
            $table->timestamps();
            // one catalogue player per external record, and one record per provider for a player
            $table->unique(['provider', 'external_id']);
            $table->unique(['player_id', 'provider']);
        });

        Schema::create('player_careers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 10);
            $table->foreignId('club_id')->nullable()->constrained()->nullOnDelete();
            $table->string('club_name')->nullable();
            $table->foreignId('from_club_id')->nullable()->constrained('clubs')->nullOnDelete();
            $table->string('from_club_name')->nullable();
            $table->unsignedSmallInteger('season')->nullable();
            $table->string('league_name')->nullable();
            $table->unsignedInteger('appearances')->default(0);
            $table->unsignedInteger('minutes')->default(0);
            $table->unsignedInteger('goals')->default(0);
            $table->unsignedInteger('assists')->default(0);
            $table->decimal('rating', 4, 2)->nullable();
            $table->date('transfer_date')->nullable();
            $table->string('transfer_type', 60)->nullable();
            $table->string('provider', 40)->nullable();
            $table->string('external_key', 120);
            $table->timestamps();
            $table->unique(['player_id', 'kind', 'external_key']);
        });
        DB::statement("ALTER TABLE player_careers ADD CONSTRAINT player_careers_kind_valid CHECK (kind IN ('season','transfer'))");

        Schema::create('player_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('url', 500);
            $table->string('source', 40)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->timestamps();
            $table->unique(['player_id', 'url']);
        });

        Schema::create('sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 40);
            $table->string('resource', 40);
            $table->jsonb('params')->default('{}');
            $table->string('status', 20)->default('running');
            $table->unsignedInteger('records_created')->default(0);
            $table->unsignedInteger('records_updated')->default(0);
            $table->text('error')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->index(['provider', 'resource', 'started_at']);
        });
        DB::statement("ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_status_valid CHECK (status IN ('running','success','failed','rate_limited'))");
    }

    public function down(): void
    {
        foreach (['sync_logs', 'player_photos', 'player_careers', 'player_external_ids', 'players', 'clubs', 'leagues', 'countries'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
