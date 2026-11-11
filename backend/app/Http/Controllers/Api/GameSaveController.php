<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\GameRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\PlayerFilterRequest;
use App\Http\Requests\StoreGameSaveRequest;
use App\Http\Requests\UpdateGameSaveRequest;
use App\Http\Resources\GamePlayerResource;
use App\Http\Resources\GameSaveResource;
use App\Models\Club;
use App\Models\GameSave;
use App\Services\Game\GameWorldService;
use App\Services\Transfers\TransferMarketService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class GameSaveController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return GameSaveResource::collection(
            $request->user()->gameSaves()->with('userClub')->latest('id')->select(GameSave::SUMMARY_COLUMNS)->paginate(25),
        );
    }

    public function store(StoreGameSaveRequest $request, GameWorldService $world): JsonResponse
    {
        // the raw document, not validated(): the rules only check the shape, and every other
        // key of the world (tactics, fixtures, tables…) has to be stored as well
        $w = $request->input('world');
        if (is_array($w)) {
            return $this->storeCloud($request, $w);
        }

        $save = $world->createSave($request->user(), $request->validated('name'), Club::findOrFail($request->validated('club_id')));

        return (new GameSaveResource($save->load('userClub')))->response()->setStatusCode(201);
    }

    /** The world document of a cloud save, exactly as the game wrote it. */
    public function showWorld(GameSave $gameSave): JsonResponse
    {
        abort_unless($gameSave->isCloud(), 404, 'This save has no world document.');

        return response()->json(['data' => [
            'id' => $gameSave->id,
            'name' => $gameSave->name,
            'season' => $gameSave->season,
            'world_version' => $gameSave->world_version,
            'updated_at' => $gameSave->updated_at->toIso8601String(),
            'world' => $gameSave->world,
        ]]);
    }

    /** Overwrite a cloud save with the current playthrough. */
    public function updateWorld(UpdateGameSaveRequest $request, GameSave $gameSave): JsonResponse
    {
        abort_unless($gameSave->isCloud(), 404, 'This save has no world document.');
        $w = $request->input('world');

        $gameSave->fill($this->worldSummary($w))->save();

        return (new GameSaveResource($gameSave->load('userClub')))->response();
    }

    public function destroy(GameSave $gameSave): JsonResponse
    {
        abort_unless($gameSave->isCloud(), 404, 'This save has no world document.');
        $gameSave->delete();

        return response()->json(null, 204);
    }

    /**
     * The save columns that mirror the world document, so a list never has to read the document.
     *
     * @param  array<string, mixed>  $w
     * @return array<string, mixed>
     */
    private function worldSummary(array $w): array
    {
        $userClub = $w['clubs'][$w['userClub']] ?? null;

        return [
            'world' => $w,
            'world_version' => $w['v'],
            'world_players' => count($w['players']),
            'world_club' => is_array($userClub) ? ($userClub['name'] ?? null) : null,
            'season' => $w['season'],
            'seed' => $w['seed'],
        ];
    }

    /** @param  array<string, mixed>  $w */
    private function storeCloud(Request $request, array $w): JsonResponse
    {
        $name = $request->validated('name');
        if ($request->user()->gameSaves()->where('name', $name)->exists()) {
            throw new GameRuleException('duplicate_save_name', "You already have a save called \"$name\".", 409);
        }

        $save = GameSave::create([
            ...$this->worldSummary($w),
            'user_id' => $request->user()->id,
            'name' => $name,
            'game_date' => now()->toDateString(),
            'is_cloud' => true,
        ]);

        return (new GameSaveResource($save))->response()->setStatusCode(201);
    }

    /** Every player of the save, with the save's own attributes, club and contract. */
    public function players(PlayerFilterRequest $request, GameSave $gameSave, TransferMarketService $market): AnonymousResourceCollection
    {
        $players = $market->players($gameSave, $request->validated())
            ->with(['player.country', 'ratings', 'club', 'gameSave', 'activeContract', 'activeListing', 'activeLoan'])
            ->paginate($request->perPage())->withQueryString();

        return GamePlayerResource::collection($players);
    }
}
