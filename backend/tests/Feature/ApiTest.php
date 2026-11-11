<?php

namespace Tests\Feature;

use App\Models\Club;
use App\Models\GameSave;
use App\Models\Player;
use App\Models\User;
use App\Services\Football\ApiFootballImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Support\ApiFootballFixtures;
use Tests\Support\BuildsGameWorld;
use Tests\TestCase;

class ApiTest extends TestCase
{
    use ApiFootballFixtures, BuildsGameWorld, RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedSmallWorld();
        $this->user = User::factory()->create();
    }

    private function createSave(string $name = 'Career', string $club = 'Alpha FC'): GameSave
    {
        $id = $this->postJson('/api/game-saves', ['name' => $name, 'club_id' => Club::where('name', $club)->value('id')])->assertCreated()->json('data.id');

        return GameSave::findOrFail($id);
    }

    public function test_everything_but_the_catalogue_and_signing_in_needs_a_token(): void
    {
        // the catalogue is public so the game can fill a save's market without an account
        $this->getJson('/api/players')->assertOk();
        $this->getJson('/api/clubs')->assertOk();

        foreach (['/api/game-saves', '/api/game-saves/1/transfer-market'] as $url) {
            $this->getJson($url)->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
        }
        $this->postJson('/api/transfer-offers/1/accept')->assertUnauthorized();
    }

    public function test_the_server_answers_a_public_health_check(): void
    {
        // the client asks this before showing a sign-in form, so it must work without a token
        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('data.status', 'ok')
            ->assertJsonPath('data.database', 'ok');
    }

    public function test_a_user_can_register_sign_in_and_use_the_token(): void
    {
        $this->postJson('/api/auth/register', ['name' => 'Kid', 'email' => 'not-an-email', 'password' => 'short'])
            ->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);

        $token = $this->postJson('/api/auth/register', ['name' => 'Kid', 'email' => 'kid@example.test', 'password' => 'secret-pass'])
            ->assertCreated()->assertJsonPath('data.user.email', 'kid@example.test')->json('data.token');
        $this->withToken($token)->getJson('/api/game-saves')->assertOk()->assertJsonCount(0, 'data');

        $this->postJson('/api/auth/login', ['email' => 'kid@example.test', 'password' => 'wrong'])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/api/auth/login', ['email' => 'kid@example.test', 'password' => 'secret-pass'])->assertOk()->assertJsonStructure(['data' => ['user' => ['id', 'name', 'email'], 'token']]);
    }

    public function test_the_catalogue_lists_real_and_fictional_players_with_filters(): void
    {
        Sanctum::actingAs($this->user);
        $real = (new ApiFootballImporter)->importPlayer($this->apiPlayer(77));

        $this->getJson('/api/players?per_page=5')->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 41)->assertJsonPath('meta.per_page', 5)
            ->assertJsonStructure(['data' => [['id', 'name', 'origin', 'age', 'nationality', 'club', 'position', 'secondary_positions', 'preferred_foot', 'personality', 'overall', 'potential', 'attributes' => ['speed', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'], 'market_value', 'wage', 'photo']], 'links' => ['next'], 'meta' => ['current_page', 'last_page']]);

        $this->getJson('/api/players?origin=real')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $real->id)
            ->assertJsonPath('data.0.photo', 'https://media.example.test/players/77.png');
        $this->getJson('/api/players?origin=fictional&position=GK')->assertOk()->assertJsonCount(4, 'data');
        $this->getJson('/api/players?search=sample')->assertOk()->assertJsonPath('data.0.name', 'Tomas Sample');
        $this->getJson('/api/players?nationality=Testland')->assertOk()->assertJsonCount(1, 'data');

        $ratings = $this->getJson('/api/players?min_rating=55&max_rating=60&per_page=100')->assertOk()->json('data.*.overall');
        $this->assertNotEmpty($ratings);
        $this->assertSame([], array_filter($ratings, fn ($r) => $r < 55 || $r > 60));
        $this->assertSame($ratings, collect($ratings)->sortDesc()->values()->all());

        $ages = $this->getJson('/api/players?min_age=30&sort=age&direction=asc&per_page=100')->assertOk()->json('data.*.age');
        $this->assertSame(Player::all()->filter(fn ($p) => $p->ageOn() >= 30)->count(), count($ages));
        $this->assertSame($ages, collect($ages)->sort()->values()->all());

        $this->getJson('/api/players?position=XX&min_age=abc&per_page=1000')->assertUnprocessable()->assertJsonValidationErrors(['position', 'min_age', 'per_page']);

        $this->getJson("/api/players/{$real->id}")->assertOk()
            ->assertJsonPath('data.origin', 'real')
            ->assertJsonPath('data.external_ids.0', ['provider' => 'api-football', 'id' => '77'])
            ->assertJsonPath('data.career.0.goals', 12);
        $this->getJson('/api/players/999999')->assertNotFound();

        $this->getJson('/api/clubs')->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0', ['id' => Club::where('name', 'Alpha FC')->value('id'), 'name' => 'Alpha FC', 'league' => 'Test League', 'is_fictional' => true, 'reputation' => 70, 'players' => 12]);
    }

    public function test_no_response_ever_contains_the_api_key(): void
    {
        Sanctum::actingAs($this->user);
        config(['football.key' => 'super-secret-key-123']);
        $real = (new ApiFootballImporter)->importPlayer($this->apiPlayer(77));
        $save = $this->createSave();

        foreach (['/api/players', "/api/players/{$real->id}", '/api/clubs', '/api/game-saves', "/api/game-saves/{$save->id}/players", "/api/game-saves/{$save->id}/transfer-market"] as $url) {
            $this->assertStringNotContainsString('super-secret-key-123', $this->getJson($url)->assertOk()->getContent());
        }
    }

    public function test_game_saves_are_created_and_listed_per_user(): void
    {
        Sanctum::actingAs($this->user);
        $clubId = Club::where('name', 'Beta FC')->value('id');

        $this->postJson('/api/game-saves', ['name' => '', 'club_id' => 999999])->assertUnprocessable()->assertJsonValidationErrors(['name', 'club_id']);

        $this->postJson('/api/game-saves', ['name' => 'My career', 'club_id' => $clubId])->assertCreated()
            ->assertJsonPath('data.name', 'My career')->assertJsonPath('data.season', 2026)->assertJsonPath('data.game_date', '2026-07-01')
            ->assertJsonPath('data.club.name', 'Beta FC')->assertJsonPath('data.club.balance', 11000)
            ->assertJsonPath('data.transfer_window.name', 'summer');
        $this->postJson('/api/game-saves', ['name' => 'My career', 'club_id' => $clubId])->assertConflict()
            ->assertExactJson(['message' => 'You already have a save called "My career".', 'code' => 'duplicate_save_name']);
        $this->createSave('Second');

        $this->getJson('/api/game-saves')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.name', 'Second');

        // someone else sees none of them and cannot open them
        $save = GameSave::first();
        Sanctum::actingAs(User::factory()->create());
        $this->getJson('/api/game-saves')->assertOk()->assertJsonCount(0, 'data');
        foreach (['players', 'transfer-market', 'transfer-history', 'transfer-offers'] as $path) {
            $this->getJson("/api/game-saves/{$save->id}/$path")->assertForbidden();
        }
        $this->postJson("/api/game-saves/{$save->id}/transfer-offers", [])->assertForbidden();
        $this->postJson("/api/game-saves/{$save->id}/transfer-listings", [])->assertForbidden();
        $this->getJson('/api/game-saves/999999/players')->assertNotFound();
    }

    public function test_a_saves_players_and_transfer_market_can_be_filtered(): void
    {
        Sanctum::actingAs($this->user);
        $real = (new ApiFootballImporter)->importPlayer($this->apiPlayer(77));
        $save = $this->createSave();
        $base = "/api/game-saves/{$save->id}";

        $this->getJson("$base/players?per_page=100")->assertOk()->assertJsonCount(41, 'data')
            ->assertJsonStructure(['data' => [['id', 'player_id', 'name', 'origin', 'age', 'position', 'club', 'is_free_agent', 'overall', 'potential', 'attributes', 'market_value', 'wage_expectation', 'contract', 'listing', 'on_loan', 'price']]]);
        $this->getJson("$base/players?club_id={$save->user_game_club_id}")->assertOk()->assertJsonCount(12, 'data')->assertJsonPath('data.0.club.name', 'Alpha FC');

        // the market leaves out the user's own squad
        $market = $this->getJson("$base/transfer-market?per_page=100")->assertOk()->assertJsonPath('meta.transfer_window_open', true)->json('data');
        $this->assertCount(41 - 12, $market);
        $this->assertNotContains('Alpha FC', array_column(array_column($market, 'club'), 'name'));

        $this->getJson("$base/transfer-market?origin=real")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.player_id', $real->id)->assertJsonPath('data.0.is_free_agent', true);
        $this->getJson("$base/transfer-market?availability=free_agents")->assertOk()->assertJsonCount(5, 'data');
        $this->getJson("$base/transfer-market?position=ST&origin=fictional")->assertOk()->assertJsonCount(3, 'data');
        $this->getJson("$base/transfer-market?nationality=Testland")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("$base/transfer-market?availability=listed")->assertOk()->assertJsonCount(0, 'data');

        foreach ([['rating', 'overall', 48, 53], ['potential', 'potential', 55, 65], ['price', 'price', 100, 200], ['age', 'age', 22, 26]] as [$filter, $field, $min, $max]) {
            $values = $this->getJson("$base/transfer-market?min_$filter=$min&max_$filter=$max&per_page=100")->assertOk()->json("data.*.$field");
            $this->assertNotEmpty($values, $filter);
            $this->assertSame([], array_filter($values, fn ($v) => $v < $min || $v > $max), $filter);
        }
        $prices = $this->getJson("$base/transfer-market?sort=price&direction=asc&per_page=100")->assertOk()->json('data.*.price');
        $this->assertSame($prices, collect($prices)->sort()->values()->all());

        $this->getJson("$base/transfer-market?availability=nope&min_price=-1")->assertUnprocessable()->assertJsonValidationErrors(['availability', 'min_price']);
    }

    public function test_buying_a_player_through_the_api(): void
    {
        Sanctum::actingAs($this->user);
        $save = $this->createSave();
        $base = "/api/game-saves/{$save->id}";
        $player = $this->playerOf($this->gameClub($save, 'Beta FC'));

        $detail = $this->getJson("$base/transfer-market/{$player->id}")->assertOk()
            ->assertJsonPath('data.player.id', $player->id)->assertJsonPath('data.offers', [])
            ->assertJsonStructure(['data' => ['asking_price', 'loan_fee', 'expected_wage']])->json('data');
        $this->getJson("$base/transfer-market/999999")->assertNotFound();

        $this->postJson("$base/transfer-offers", ['game_player_id' => $player->id, 'type' => 'transfer'])
            ->assertUnprocessable()->assertJsonValidationErrors(['fee', 'wage', 'contract_years']);
        $this->postJson("$base/transfer-offers", ['game_player_id' => 999999, 'type' => 'loan', 'fee' => 1])
            ->assertUnprocessable()->assertJsonValidationErrors(['game_player_id', 'loan_ends_on']);

        // a low bid is countered
        $bid = (int) floor($detail['asking_price'] * 0.8);
        $offer = $this->postJson("$base/transfer-offers", ['game_player_id' => $player->id, 'type' => 'transfer', 'fee' => $bid, 'wage' => $detail['expected_wage'], 'contract_years' => 3])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.your_side', 'buyer')->assertJsonPath('data.your_turn', true)
            ->assertJsonPath('data.negotiation.1.side', 'seller')->assertJsonPath('data.negotiation.1.action', 'counter')
            ->assertJsonPath('data.player.id', $player->id)->assertJsonPath('data.selling_club.name', 'Beta FC')
            ->json('data');
        $this->assertGreaterThan($bid, $offer['fee']);

        $this->postJson("$base/transfer-offers", ['game_player_id' => $player->id, 'type' => 'transfer', 'fee' => $bid, 'wage' => 5, 'contract_years' => 3])
            ->assertConflict()->assertJsonPath('code', 'duplicate_offer');
        $this->getJson("$base/transfer-offers?status=pending&direction=outgoing")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $offer['id']);
        $this->getJson("$base/transfer-market/{$player->id}")->assertOk()->assertJsonPath('data.offers.0.id', $offer['id']);

        $this->postJson("/api/transfer-offers/{$offer['id']}/counter", [])->assertUnprocessable()->assertJsonValidationErrors('fee');
        $this->postJson("/api/transfer-offers/{$offer['id']}/counter", ['fee' => $bid + 1])->assertOk()
            ->assertJsonPath('data.status', 'pending')->assertJsonPath('data.fee', $offer['fee']);

        $this->postJson("/api/transfer-offers/{$offer['id']}/accept")->assertOk()
            ->assertJsonPath('data.status', 'completed')->assertJsonPath('data.your_turn', false);
        $this->postJson("/api/transfer-offers/{$offer['id']}/accept")->assertConflict()
            ->assertExactJson(['message' => 'This offer is no longer open.', 'code' => 'offer_closed']);
        $this->postJson("/api/transfer-offers/{$offer['id']}/reject")->assertConflict()->assertJsonPath('code', 'offer_closed');

        $this->getJson("$base/players?club_id={$save->user_game_club_id}&per_page=100")->assertOk()->assertJsonCount(13, 'data');
        $this->getJson("$base/transfer-history")->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'transfer')->assertJsonPath('data.0.fee', $offer['fee'])
            ->assertJsonPath('data.0.player.id', $player->id)->assertJsonPath('data.0.from_club.name', 'Beta FC')->assertJsonPath('data.0.to_club.name', 'Alpha FC')
            ->assertJsonPath('data.0.date', '2026-07-01')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/game-saves')->assertOk()->assertJsonPath('data.0.club.balance', 12500 - $offer['fee']);

        // another user cannot touch the offers of this save
        Sanctum::actingAs(User::factory()->create());
        foreach (['accept', 'reject', 'counter'] as $action) {
            $this->postJson("/api/transfer-offers/{$offer['id']}/$action", ['fee' => 1])->assertForbidden();
        }
        $this->postJson('/api/transfer-offers/999999/accept')->assertNotFound();
    }

    public function test_selling_loaning_and_signing_through_the_api(): void
    {
        Sanctum::actingAs($this->user);
        $save = $this->createSave();
        $base = "/api/game-saves/{$save->id}";
        $mine = $this->playerOf($save->userClub);
        $theirs = $this->playerOf($this->gameClub($save, 'Beta FC'));

        // sell: list a player, get bids, reject one, accept the other
        $this->postJson("$base/transfer-listings", ['game_player_id' => $theirs->id, 'asking_price' => 100])
            ->assertForbidden()->assertExactJson(['message' => 'That player is not at your club.', 'code' => 'not_your_player']);
        $this->postJson("$base/transfer-listings", ['game_player_id' => $mine->id, 'asking_price' => 0])->assertUnprocessable()->assertJsonValidationErrors('asking_price');

        $listing = $this->postJson("$base/transfer-listings", ['game_player_id' => $mine->id, 'asking_price' => $mine->ratings->market_value])
            ->assertCreated()->assertJsonPath('data.status', 'active')->assertJsonCount(2, 'data.offers')
            ->assertJsonPath('data.offers.0.your_side', 'seller')->assertJsonPath('data.offers.0.your_turn', true)->json('data');
        $this->postJson("$base/transfer-listings", ['game_player_id' => $mine->id, 'asking_price' => 5])->assertConflict()->assertJsonPath('code', 'already_listed');
        $this->getJson("$base/players?availability=listed")->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.listing.asking_price', $mine->ratings->market_value)->assertJsonPath('data.0.price', $mine->ratings->market_value);
        $this->getJson("$base/transfer-offers?direction=incoming")->assertOk()->assertJsonCount(2, 'data');

        $this->postJson("/api/transfer-offers/{$listing['offers'][0]['id']}/reject", ['note' => 'Too low'])->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.closing_note', 'Too low');
        $this->postJson("/api/transfer-offers/{$listing['offers'][1]['id']}/accept")->assertOk()
            ->assertJsonPath('data.status', 'completed')->assertJsonPath('data.buying_club.name', 'Gamma FC');

        // loan a player in
        $this->postJson("$base/transfer-offers", ['game_player_id' => $theirs->id, 'type' => 'loan', 'fee' => (int) ceil($theirs->ratings->market_value * 0.1), 'loan_ends_on' => '2027-01-15'])
            ->assertCreated()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.loan_ends_on', '2027-01-15');
        $this->getJson("$base/players?club_id={$save->user_game_club_id}&search=".urlencode($theirs->player->name))->assertOk()
            ->assertJsonPath('data.0.on_loan.ends_on', '2027-01-15')->assertJsonPath('data.0.contract.wage', $theirs->activeContract->wage);

        // sign a free agent
        $free = $this->freeAgent($save);
        $this->postJson("$base/transfer-offers", ['game_player_id' => $free->id, 'type' => 'free_agent', 'wage' => $free->ratings->wage_expectation, 'contract_years' => 2])
            ->assertCreated()->assertJsonPath('data.status', 'completed')->assertJsonPath('data.selling_club', null)->assertJsonPath('data.fee', 0);

        $this->getJson("$base/transfer-history")->assertOk()->assertJsonPath('meta.total', 3)
            ->assertJsonPath('data.0.type', 'free_agent')->assertJsonPath('data.0.from_club', null)
            ->assertJsonPath('data.1.type', 'loan')->assertJsonPath('data.2.type', 'transfer');
        $this->getJson("$base/transfer-history?type=loan")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("$base/transfer-history?type=nope")->assertUnprocessable();
    }
}
