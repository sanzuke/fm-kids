<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PlayerFilterRequest;
use App\Http\Requests\StoreTransferListingRequest;
use App\Http\Resources\GamePlayerResource;
use App\Http\Resources\TransferListingResource;
use App\Http\Resources\TransferOfferResource;
use App\Http\Resources\TransferResource;
use App\Models\GameSave;
use App\Models\GameTransferOffer;
use App\Services\Transfers\TransferMarketService;
use App\Services\Transfers\TransferNegotiator;
use App\Services\Transfers\TransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class TransferMarketController extends Controller
{
    private const PLAYER_RELATIONS = ['player.country', 'ratings', 'club', 'gameSave', 'activeContract', 'activeListing', 'activeLoan'];

    /** Players the user's club could go for: everyone at other clubs and all free agents. */
    public function index(PlayerFilterRequest $request, GameSave $gameSave, TransferMarketService $market): AnonymousResourceCollection
    {
        $players = $market->players($gameSave, $request->validated(), excludeClubId: $gameSave->user_game_club_id)
            ->with(self::PLAYER_RELATIONS)->paginate($request->perPage())->withQueryString();

        return GamePlayerResource::collection($players)->additional(['meta' => ['transfer_window_open' => $market->currentWindow($gameSave) !== null]]);
    }

    /** One player on the market: what a deal would cost and the offers already made for them. */
    public function show(GameSave $gameSave, int $playerId, TransferNegotiator $negotiator): JsonResponse
    {
        $player = $gameSave->players()->with(self::PLAYER_RELATIONS)->findOrFail($playerId);
        $offers = $player->offers()->with(['gameSave', 'gamePlayer.player', 'buyingClub', 'sellingClub', 'negotiations', 'transfer'])
            ->where(fn ($q) => $q->where('buying_club_id', $gameSave->user_game_club_id)->orWhere('selling_club_id', $gameSave->user_game_club_id))
            ->latest('id')->get();

        return response()->json(['data' => [
            'player' => new GamePlayerResource($player),
            'asking_price' => $player->isFreeAgent() ? 0 : $negotiator->askingPrice($player, GameTransferOffer::TRANSFER),
            'loan_fee' => $player->isFreeAgent() ? null : $negotiator->askingPrice($player, GameTransferOffer::LOAN),
            'expected_wage' => $player->ratings->wage_expectation,
            'offers' => TransferOfferResource::collection($offers),
        ]]);
    }

    public function storeListing(StoreTransferListingRequest $request, GameSave $gameSave, TransferService $transfers): JsonResponse
    {
        $listing = $transfers->listPlayer(
            $gameSave->userClub,
            $gameSave->players()->findOrFail($request->validated('game_player_id')),
            (int) $request->validated('asking_price'),
            $request->validated('type', 'transfer'),
        );
        $listing->load(['gamePlayer.player', 'club', 'offers.gameSave', 'offers.gamePlayer.player', 'offers.buyingClub', 'offers.sellingClub', 'offers.negotiations', 'offers.transfer']);

        return (new TransferListingResource($listing))->response()->setStatusCode(201);
    }

    /** Completed transfers, loans, free-agent signings and loan returns of the save, newest first. */
    public function history(Request $request, GameSave $gameSave): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'type' => ['sometimes', 'in:transfer,loan,free_agent,loan_return'],
            'club_id' => ['sometimes', 'integer'],
            'game_player_id' => ['sometimes', 'integer'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ]);
        $transfers = $gameSave->transfers()->with(['gamePlayer.player', 'fromClub', 'toClub'])
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($filters['game_player_id'] ?? null, fn ($q, $v) => $q->where('game_player_id', $v))
            ->when($filters['club_id'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('from_club_id', $v)->orWhere('to_club_id', $v)))
            ->latest('id')->paginate((int) ($filters['per_page'] ?? 25))->withQueryString();

        return TransferResource::collection($transfers);
    }
}
