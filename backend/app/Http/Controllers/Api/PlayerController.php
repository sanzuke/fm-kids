<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PlayerFilterRequest;
use App\Http\Resources\PlayerResource;
use App\Models\Club;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** The shared catalogue of real and fictional players. */
class PlayerController extends Controller
{
    private const SORTS = ['overall' => 'base_overall', 'potential' => 'base_potential', 'price' => 'base_market_value', 'value' => 'base_market_value', 'age' => 'birth_date', 'name' => 'name'];

    public function index(PlayerFilterRequest $request): AnonymousResourceCollection
    {
        $f = $request->validated();
        $direction = ($f['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        $sort = self::SORTS[$f['sort'] ?? 'overall'];
        if ($sort === 'birth_date') {
            $direction = $direction === 'asc' ? 'desc' : 'asc';
        }

        $players = Player::with(['country', 'club', 'photos'])->filter($f)
            ->when(isset($f['min_rating']), fn ($q) => $q->where('base_overall', '>=', $f['min_rating']))
            ->when(isset($f['max_rating']), fn ($q) => $q->where('base_overall', '<=', $f['max_rating']))
            ->when(isset($f['min_potential']), fn ($q) => $q->where('base_potential', '>=', $f['min_potential']))
            ->when(isset($f['max_potential']), fn ($q) => $q->where('base_potential', '<=', $f['max_potential']))
            ->when(isset($f['min_price']), fn ($q) => $q->where('base_market_value', '>=', $f['min_price']))
            ->when(isset($f['max_price']), fn ($q) => $q->where('base_market_value', '<=', $f['max_price']))
            ->when(isset($f['club_id']), fn ($q) => $q->where('club_id', $f['club_id']))
            ->orderBy($sort, $direction)->orderBy('id')
            ->paginate($request->perPage())->withQueryString();

        return PlayerResource::collection($players);
    }

    public function show(Player $player): PlayerResource
    {
        return new PlayerResource($player->load(['country', 'club', 'photos', 'externalIds', 'careers' => fn ($q) => $q->orderByDesc('season')->orderByDesc('transfer_date')]));
    }

    /** Clubs a new game save can be started with. */
    public function clubs(Request $request): JsonResponse
    {
        $clubs = Club::with('league:id,name')->withCount('players')->orderBy('league_id')->orderBy('name')->paginate(min(100, max(1, (int) $request->query('per_page', 50))));

        return response()->json([
            'data' => $clubs->map(fn (Club $c) => [
                'id' => $c->id, 'name' => $c->name, 'league' => $c->league?->name, 'is_fictional' => $c->is_fictional,
                'reputation' => $c->reputation, 'players' => $c->players_count,
            ]),
            'meta' => ['current_page' => $clubs->currentPage(), 'last_page' => $clubs->lastPage(), 'per_page' => $clubs->perPage(), 'total' => $clubs->total()],
        ]);
    }
}
