<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Module 5: the transfer market of a game save. Clubs and players are always referenced
 * together with their save (composite foreign keys), so a deal can never cross saves.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_transfer_windows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('season');
            $table->string('name', 20);
            $table->date('opens_on');
            $table->date('closes_on');
            $table->string('status', 10)->default('upcoming');
            $table->timestamps();
            $table->unique(['game_save_id', 'season', 'name']);
        });
        DB::statement("ALTER TABLE game_transfer_windows ADD CONSTRAINT game_transfer_windows_valid CHECK (status IN ('upcoming','open','closed') AND closes_on >= opens_on)");

        Schema::create('game_transfer_listings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_player_id');
            $table->unsignedBigInteger('game_club_id');
            $table->string('type', 10)->default('transfer');
            $table->unsignedBigInteger('asking_price');
            $table->string('status', 10)->default('active');
            $table->date('listed_on');
            $table->date('closed_on')->nullable();
            $table->timestamps();
            $table->index(['game_save_id', 'status']);
        });
        $this->saveScoped('game_transfer_listings', 'game_player_id', 'game_players');
        $this->saveScoped('game_transfer_listings', 'game_club_id', 'game_clubs');
        DB::statement("ALTER TABLE game_transfer_listings ADD CONSTRAINT game_transfer_listings_valid CHECK (type IN ('transfer','loan') AND status IN ('active','sold','withdrawn'))");
        // a player is on the market once at most
        DB::statement("CREATE UNIQUE INDEX game_transfer_listings_one_active ON game_transfer_listings (game_player_id) WHERE status = 'active'");

        Schema::create('game_transfer_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_player_id');
            $table->unsignedBigInteger('buying_club_id');
            // null = the player is a free agent and answers for themselves
            $table->unsignedBigInteger('selling_club_id')->nullable();
            $table->foreignId('game_transfer_listing_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 10);
            $table->unsignedBigInteger('fee')->default(0);
            $table->unsignedBigInteger('wage')->nullable();
            $table->unsignedSmallInteger('contract_years')->nullable();
            $table->date('loan_ends_on')->nullable();
            $table->string('status', 10)->default('pending');
            // whose answer the offer is waiting for
            $table->string('awaiting', 6)->default('seller');
            // set once the player is happy with the wage and length on the table
            $table->boolean('player_agreed')->default(false);
            $table->unsignedSmallInteger('rounds')->default(1);
            $table->string('closing_note')->nullable();
            $table->date('offered_on');
            $table->date('closed_on')->nullable();
            $table->timestamps();
            $table->index(['game_save_id', 'status']);
            $table->index(['game_player_id', 'status']);
        });
        $this->saveScoped('game_transfer_offers', 'game_player_id', 'game_players');
        $this->saveScoped('game_transfer_offers', 'buying_club_id', 'game_clubs');
        $this->saveScoped('game_transfer_offers', 'selling_club_id', 'game_clubs');
        DB::statement("ALTER TABLE game_transfer_offers ADD CONSTRAINT game_transfer_offers_valid CHECK (
            type IN ('transfer','loan','free_agent')
            AND status IN ('pending','completed','rejected','withdrawn')
            AND awaiting IN ('buyer','seller','none')
            AND (status = 'pending') = (awaiting <> 'none')
            AND buying_club_id IS DISTINCT FROM selling_club_id
            AND (type = 'free_agent') = (selling_club_id IS NULL)
            AND (type <> 'free_agent' OR fee = 0)
            AND (type = 'loan') = (loan_ends_on IS NOT NULL)
            AND (type = 'loan' OR (wage >= 1 AND contract_years BETWEEN 1 AND 5)))");
        // a club has one open offer per player; a new bid goes through the counter-offer instead
        DB::statement("CREATE UNIQUE INDEX game_transfer_offers_one_pending ON game_transfer_offers (game_player_id, buying_club_id) WHERE status = 'pending'");

        Schema::create('game_transfer_negotiations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_transfer_offer_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('step');
            // who spoke: the buying club, the selling club, or the player
            $table->string('side', 6);
            $table->string('action', 8);
            $table->unsignedBigInteger('fee')->nullable();
            $table->unsignedBigInteger('wage')->nullable();
            $table->unsignedSmallInteger('contract_years')->nullable();
            $table->string('note')->nullable();
            $table->timestamps();
            $table->unique(['game_transfer_offer_id', 'step']);
        });
        DB::statement("ALTER TABLE game_transfer_negotiations ADD CONSTRAINT game_transfer_negotiations_valid CHECK (side IN ('buyer','seller','player') AND action IN ('offer','counter','accept','reject'))");

        Schema::create('game_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_player_id');
            $table->unsignedBigInteger('from_club_id')->nullable();
            $table->unsignedBigInteger('to_club_id');
            // one completed transfer per offer: a second completion of the same offer cannot be stored
            $table->foreignId('game_transfer_offer_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->foreignId('game_transfer_window_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 12);
            $table->unsignedBigInteger('fee')->default(0);
            $table->unsignedBigInteger('wage')->nullable();
            $table->unsignedSmallInteger('season');
            $table->date('game_date');
            $table->timestamps();
            $table->index(['game_save_id', 'id']);
            $table->index('game_player_id');
        });
        $this->saveScoped('game_transfers', 'game_player_id', 'game_players');
        $this->saveScoped('game_transfers', 'from_club_id', 'game_clubs');
        $this->saveScoped('game_transfers', 'to_club_id', 'game_clubs');
        DB::statement("ALTER TABLE game_transfers ADD CONSTRAINT game_transfers_valid CHECK (type IN ('transfer','loan','free_agent','loan_return') AND from_club_id IS DISTINCT FROM to_club_id)");

        Schema::create('game_loan_agreements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_save_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('game_player_id');
            $table->unsignedBigInteger('parent_club_id');
            $table->unsignedBigInteger('loan_club_id');
            $table->foreignId('game_transfer_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('fee')->default(0);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status', 10)->default('active');
            $table->timestamps();
            $table->index(['game_save_id', 'status', 'ends_on']);
        });
        $this->saveScoped('game_loan_agreements', 'game_player_id', 'game_players');
        $this->saveScoped('game_loan_agreements', 'parent_club_id', 'game_clubs');
        $this->saveScoped('game_loan_agreements', 'loan_club_id', 'game_clubs');
        DB::statement("ALTER TABLE game_loan_agreements ADD CONSTRAINT game_loan_agreements_valid CHECK (status IN ('active','completed') AND ends_on > starts_on AND parent_club_id <> loan_club_id)");
        DB::statement("CREATE UNIQUE INDEX game_loan_agreements_one_active ON game_loan_agreements (game_player_id) WHERE status = 'active'");
    }

    public function down(): void
    {
        foreach (['game_loan_agreements', 'game_transfers', 'game_transfer_negotiations', 'game_transfer_offers', 'game_transfer_listings', 'game_transfer_windows'] as $table) {
            Schema::dropIfExists($table);
        }
    }

    /** Foreign key on (column, game_save_id) so the referenced row belongs to the same save. */
    private function saveScoped(string $table, string $column, string $references): void
    {
        DB::statement("ALTER TABLE $table ADD CONSTRAINT {$table}_{$column}_fk FOREIGN KEY ($column, game_save_id) REFERENCES $references (id, game_save_id) ON DELETE CASCADE");
    }
};
