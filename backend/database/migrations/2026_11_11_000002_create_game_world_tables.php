<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Module 4: everything that changes while playing, kept apart per game save.
 * Catalogue rows (clubs, players) are only referenced, never written.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_saves', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->unsignedSmallInteger('season');
            $table->date('game_date');
            $table->unsignedBigInteger('user_game_club_id')->nullable();
            $table->unsignedBigInteger('seed');
            $table->timestamps();
            $table->unique(['user_id', 'name']);
        });

        Schema::create('game_clubs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->foreignId('club_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->unsignedSmallInteger('reputation')->default(50);
            $table->bigInteger('balance')->default(0);
            $table->bigInteger('transfer_budget')->default(0);
            $table->bigInteger('wage_budget')->default(0);
            $table->boolean('is_user_controlled')->default(false);
            $table->timestamps();
            $table->unique(['game_save_id', 'club_id']);
            // lets other tables point at a club together with its save, so rows can never cross saves
            $table->unique(['id', 'game_save_id']);
        });
        DB::statement('ALTER TABLE game_clubs ADD CONSTRAINT game_clubs_balance_not_negative CHECK (balance >= 0)');
        DB::statement('ALTER TABLE game_clubs ADD CONSTRAINT game_clubs_budgets_not_negative CHECK (transfer_budget >= 0 AND wage_budget >= 0)');
        DB::statement('CREATE UNIQUE INDEX game_clubs_one_user_club ON game_clubs (game_save_id) WHERE is_user_controlled');
        DB::statement('ALTER TABLE game_saves ADD CONSTRAINT game_saves_user_club_fk FOREIGN KEY (user_game_club_id, id) REFERENCES game_clubs (id, game_save_id) DEFERRABLE INITIALLY DEFERRED');

        Schema::create('game_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->restrictOnDelete();
            // the club the player plays for now; null = free agent
            $table->unsignedBigInteger('game_club_id')->nullable();
            $table->unsignedSmallInteger('squad_number')->nullable();
            $table->string('status', 12)->default('active');
            $table->timestamps();
            $table->unique(['game_save_id', 'player_id']);
            $table->unique(['id', 'game_save_id']);
            $table->index(['game_save_id', 'game_club_id']);
        });
        DB::statement('ALTER TABLE game_players ADD CONSTRAINT game_players_club_same_save_fk FOREIGN KEY (game_club_id, game_save_id) REFERENCES game_clubs (id, game_save_id)');
        DB::statement("ALTER TABLE game_players ADD CONSTRAINT game_players_status_valid CHECK (status IN ('active','retired'))");
        DB::statement('ALTER TABLE game_players ADD CONSTRAINT game_players_number_range CHECK (squad_number IS NULL OR squad_number BETWEEN 1 AND 99)');
        DB::statement('CREATE UNIQUE INDEX game_players_number_per_club ON game_players (game_club_id, squad_number) WHERE squad_number IS NOT NULL AND game_club_id IS NOT NULL');

        Schema::create('game_player_attributes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_player_id')->unique()->constrained()->cascadeOnDelete();
            foreach (['speed', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'] as $attribute) {
                $table->unsignedSmallInteger($attribute);
            }
            $table->unsignedSmallInteger('overall');
            $table->unsignedSmallInteger('potential');
            $table->unsignedBigInteger('market_value');
            $table->unsignedBigInteger('wage_expectation');
            $table->unsignedSmallInteger('morale')->default(70);
            $table->unsignedSmallInteger('fitness')->default(100);
            $table->timestamps();
            $table->index('overall');
            $table->index('potential');
            $table->index('market_value');
        });
        DB::statement('ALTER TABLE game_player_attributes ADD CONSTRAINT game_player_attributes_ranges CHECK (
            speed BETWEEN 1 AND 99 AND shooting BETWEEN 1 AND 99 AND passing BETWEEN 1 AND 99 AND dribbling BETWEEN 1 AND 99
            AND defending BETWEEN 1 AND 99 AND stamina BETWEEN 1 AND 99 AND overall BETWEEN 1 AND 99
            AND potential BETWEEN overall AND 99 AND morale BETWEEN 0 AND 100 AND fitness BETWEEN 0 AND 100)');

        Schema::create('game_player_development', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_player_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('season');
            $table->date('game_date');
            $table->unsignedSmallInteger('age');
            $table->unsignedSmallInteger('overall_before');
            $table->unsignedSmallInteger('overall_after');
            $table->unsignedSmallInteger('potential');
            $table->jsonb('changes');
            $table->string('reason', 40);
            $table->timestamps();
            $table->index(['game_player_id', 'season']);
        });

        Schema::create('game_player_contracts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_player_id');
            $table->unsignedBigInteger('game_club_id');
            $table->unsignedBigInteger('wage');
            $table->unsignedBigInteger('signing_bonus')->default(0);
            $table->unsignedBigInteger('release_clause')->nullable();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status', 12)->default('active');
            $table->date('ended_on')->nullable();
            $table->timestamps();
            $table->index(['game_club_id', 'status']);
            $table->index(['game_save_id', 'status', 'ends_on']);
        });
        DB::statement('ALTER TABLE game_player_contracts ADD CONSTRAINT game_player_contracts_player_fk FOREIGN KEY (game_player_id, game_save_id) REFERENCES game_players (id, game_save_id) ON DELETE CASCADE');
        DB::statement('ALTER TABLE game_player_contracts ADD CONSTRAINT game_player_contracts_club_fk FOREIGN KEY (game_club_id, game_save_id) REFERENCES game_clubs (id, game_save_id) ON DELETE CASCADE');
        DB::statement("ALTER TABLE game_player_contracts ADD CONSTRAINT game_player_contracts_status_valid CHECK (status IN ('active','expired','terminated','transferred'))");
        DB::statement('ALTER TABLE game_player_contracts ADD CONSTRAINT game_player_contracts_dates CHECK (ends_on > starts_on)');
        // a player has at most one running contract
        DB::statement("CREATE UNIQUE INDEX game_player_contracts_one_active ON game_player_contracts (game_player_id) WHERE status = 'active'");

        Schema::create('game_finance_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_club_id');
            $table->string('type', 24);
            // positive = money in, negative = money out
            $table->bigInteger('amount');
            $table->bigInteger('balance_after');
            $table->string('description');
            $table->nullableMorphs('reference');
            $table->date('game_date');
            $table->timestamps();
            $table->index(['game_club_id', 'id']);
        });
        DB::statement('ALTER TABLE game_finance_transactions ADD CONSTRAINT game_finance_transactions_club_fk FOREIGN KEY (game_club_id, game_save_id) REFERENCES game_clubs (id, game_save_id) ON DELETE CASCADE');
        DB::statement("ALTER TABLE game_finance_transactions ADD CONSTRAINT game_finance_transactions_type_valid CHECK (type IN
            ('initial','transfer_fee_paid','transfer_fee_received','loan_fee_paid','loan_fee_received','signing_bonus','wages','prize','other'))");
        DB::statement('ALTER TABLE game_finance_transactions ADD CONSTRAINT game_finance_transactions_amount_not_zero CHECK (amount <> 0 AND balance_after >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE game_saves DROP CONSTRAINT IF EXISTS game_saves_user_club_fk');
        foreach (['game_finance_transactions', 'game_player_contracts', 'game_player_development', 'game_player_attributes', 'game_players', 'game_clubs', 'game_saves'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
