<?php

namespace Tests\Feature;

use App\Models\GameSave;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Cloud saves keep a whole playthrough on the server, next to the shared catalogue and
 * separate from every other save and every other user.
 */
class CloudSaveTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create();
        Sanctum::actingAs($this->user);
    }

    /** @return array<string, mixed> */
    private function world(string $club = 'Happy Rockets', int $season = 1, int $players = 2): array
    {
        return [
            'v' => 7,
            'seed' => 123456,
            'season' => $season,
            'step' => 3,
            'userClub' => 0,
            'clubs' => [
                ['id' => 0, 'name' => $club, 'div' => 2, 'isUser' => true],
                ['id' => 1, 'name' => 'Rival FC', 'div' => 2, 'isUser' => false],
            ],
            'players' => array_map(fn (int $i) => ['id' => $i, 'name' => "Player $i", 'clubId' => $i === 0 ? 0 : 1, 'ovr' => 60 + $i], range(0, $players - 1)),
            // keys the request rules do not mention must survive the round trip too
            'tactics' => ['formation' => '4-4-2', 'slots' => null],
            'tables' => [[], [], []],
            'fixtures' => [],
        ];
    }

    /** @param array<string, mixed> $world */
    private function save(array $world, string $name = 'My career'): int
    {
        return $this->postJson('/api/game-saves', ['name' => $name, 'world' => $world])
            ->assertCreated()
            ->assertJsonPath('data.mode', 'cloud')
            ->assertJsonPath('data.club.name', $world['clubs'][0]['name'])
            ->json('data.id');
    }

    public function test_a_cloud_save_round_trips_the_whole_world(): void
    {
        $world = $this->world();
        $id = $this->save($world);

        $this->assertDatabaseHas('game_saves', ['id' => $id, 'is_cloud' => true, 'world_players' => 2, 'world_club' => 'Happy Rockets']);

        $this->getJson("/api/game-saves/$id/world")
            ->assertOk()
            ->assertJsonPath('data.world.seed', 123456)
            ->assertJsonPath('data.world.tactics.formation', '4-4-2')
            ->assertJsonPath('data.world.clubs.0.name', 'Happy Rockets')
            ->assertJsonPath('data.world.players.1.name', 'Player 1');

        // the list stays small: it describes the save without sending the document
        $list = $this->getJson('/api/game-saves')->assertOk();
        $item = collect($list->json('data'))->firstWhere('id', $id);
        $this->assertSame('cloud', $item['mode']);
        $this->assertSame(2, $item['world']['players']);
        $this->assertSame('Happy Rockets', $item['club']['name']);
    }

    public function test_updating_a_cloud_save_keeps_its_identity_and_replaces_the_world(): void
    {
        $id = $this->save($this->world());

        $this->putJson("/api/game-saves/$id/world", ['world' => $this->world('Happy Rockets', 2, 3)])
            ->assertOk()
            ->assertJsonPath('data.season', 2)
            ->assertJsonPath('data.world.players', 3);

        $this->assertDatabaseCount('game_saves', 1);
        $this->getJson("/api/game-saves/$id/world")->assertJsonPath('data.world.players.2.name', 'Player 2');
    }

    public function test_a_user_can_keep_several_saves_but_not_two_with_the_same_name(): void
    {
        $this->save($this->world(), 'Career A');
        $this->save($this->world('Second Club'), 'Career B');

        $this->assertSame(2, $this->getJson('/api/game-saves')->json('meta.total'));
        $this->postJson('/api/game-saves', ['name' => 'Career A', 'world' => $this->world()])
            ->assertStatus(409)
            ->assertJsonPath('code', 'duplicate_save_name');
    }

    public function test_another_user_cannot_read_or_delete_the_save(): void
    {
        $id = $this->save($this->world());

        Sanctum::actingAs(User::factory()->create());

        $this->getJson("/api/game-saves/$id/world")->assertForbidden();
        $this->putJson("/api/game-saves/$id/world", ['world' => $this->world()])->assertForbidden();
        $this->deleteJson("/api/game-saves/$id")->assertForbidden();
        $this->assertDatabaseCount('game_saves', 1);
    }

    public function test_a_cloud_save_can_be_deleted(): void
    {
        $id = $this->save($this->world());

        $this->deleteJson("/api/game-saves/$id")->assertNoContent();
        $this->assertDatabaseMissing('game_saves', ['id' => $id]);
        $this->getJson("/api/game-saves/$id/world")->assertNotFound();
    }

    public function test_a_world_document_must_look_like_a_game_world(): void
    {
        $this->postJson('/api/game-saves', ['name' => 'Broken', 'world' => ['v' => 1]])
            ->assertUnprocessable();

        $this->postJson('/api/game-saves', ['name' => 'No world'])
            ->assertUnprocessable();
    }

    public function test_a_structured_save_has_no_world_document(): void
    {
        $save = GameSave::create([
            'user_id' => $this->user->id, 'name' => 'Structured', 'season' => 2026,
            'game_date' => '2026-07-01', 'seed' => 1, 'is_cloud' => false,
        ]);

        $this->getJson("/api/game-saves/{$save->id}/world")->assertNotFound();

        // and it cannot be deleted through the cloud route
        $this->deleteJson("/api/game-saves/{$save->id}")->assertNotFound();
        $this->assertDatabaseHas('game_saves', ['id' => $save->id]);
    }
}
