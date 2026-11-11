<?php

namespace App\Http\Resources;

use App\Models\GameTransferOffer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin GameTransferOffer */
class TransferOfferResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $userClubId = $this->gameSave->user_game_club_id;
        $yourSide = $userClubId === $this->buying_club_id ? 'buyer' : ($userClubId === $this->selling_club_id ? 'seller' : null);

        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'awaiting' => $this->awaiting,
            'your_side' => $yourSide,
            'your_turn' => $this->status === 'pending' && $yourSide === $this->awaiting,
            'fee' => $this->fee,
            'wage' => $this->wage,
            'contract_years' => $this->contract_years,
            'loan_ends_on' => $this->loan_ends_on?->toDateString(),
            'player_agreed' => $this->player_agreed,
            'rounds' => $this->rounds,
            'closing_note' => $this->closing_note,
            'offered_on' => $this->offered_on->toDateString(),
            'closed_on' => $this->closed_on?->toDateString(),
            'player' => ['id' => $this->game_player_id, 'name' => $this->gamePlayer->player->name, 'position' => $this->gamePlayer->player->primary_position->value],
            'buying_club' => ['id' => $this->buying_club_id, 'name' => $this->buyingClub->name],
            'selling_club' => $this->sellingClub ? ['id' => $this->selling_club_id, 'name' => $this->sellingClub->name] : null,
            'transfer_id' => $this->transfer?->id,
            'negotiation' => $this->negotiations->map(fn ($n) => array_filter([
                'step' => $n->step, 'side' => $n->side, 'action' => $n->action, 'fee' => $n->fee, 'wage' => $n->wage,
                'contract_years' => $n->contract_years, 'note' => $n->note,
            ], fn ($v) => $v !== null)),
        ];
    }
}
