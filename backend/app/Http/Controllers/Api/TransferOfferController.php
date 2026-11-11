<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CounterTransferOfferRequest;
use App\Http\Requests\StoreTransferOfferRequest;
use App\Http\Resources\TransferOfferResource;
use App\Models\GameSave;
use App\Models\GameTransferOffer;
use App\Services\Transfers\TransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/** The user always acts for the club they manage in the save. */
class TransferOfferController extends Controller
{
    private const RELATIONS = ['gameSave', 'gamePlayer.player', 'buyingClub', 'sellingClub', 'negotiations', 'transfer'];

    /** Offers the user's club made or received, newest first. */
    public function index(Request $request, GameSave $gameSave): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'status' => ['sometimes', 'in:pending,completed,rejected,withdrawn'],
            'direction' => ['sometimes', 'in:incoming,outgoing'],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
        ]);
        $club = $gameSave->user_game_club_id;
        $offers = $gameSave->transferOffers()->with(self::RELATIONS)
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->where(fn ($q) => match ($filters['direction'] ?? null) {
                'incoming' => $q->where('selling_club_id', $club),
                'outgoing' => $q->where('buying_club_id', $club),
                default => $q->where('buying_club_id', $club)->orWhere('selling_club_id', $club),
            })
            ->latest('id')->paginate((int) ($filters['per_page'] ?? 25))->withQueryString();

        return TransferOfferResource::collection($offers);
    }

    public function store(StoreTransferOfferRequest $request, GameSave $gameSave, TransferService $transfers): JsonResponse
    {
        $offer = $transfers->makeOffer($gameSave->userClub, $gameSave->players()->findOrFail($request->validated('game_player_id')), $request->validated());

        return $this->respond($offer, 201);
    }

    public function accept(GameTransferOffer $offer, TransferService $transfers): JsonResponse
    {
        Gate::authorize('play', $offer->gameSave);

        return $this->respond($transfers->accept($offer, $offer->gameSave->userClub));
    }

    public function reject(Request $request, GameTransferOffer $offer, TransferService $transfers): JsonResponse
    {
        Gate::authorize('play', $offer->gameSave);
        $note = $request->validate(['note' => ['sometimes', 'nullable', 'string', 'max:200']])['note'] ?? null;

        return $this->respond($transfers->reject($offer, $offer->gameSave->userClub, $note));
    }

    public function counter(CounterTransferOfferRequest $request, GameTransferOffer $offer, TransferService $transfers): JsonResponse
    {
        return $this->respond($transfers->counter($offer, $offer->gameSave->userClub, $request->validated()));
    }

    private function respond(GameTransferOffer $offer, int $status = 200): JsonResponse
    {
        return (new TransferOfferResource($offer->fresh(self::RELATIONS)))->response()->setStatusCode($status);
    }
}
