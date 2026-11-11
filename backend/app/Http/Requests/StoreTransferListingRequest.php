<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTransferListingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('play', $this->route('gameSave'));
    }

    public function rules(): array
    {
        return [
            'game_player_id' => ['required', 'integer', Rule::exists('game_players', 'id')->where('game_save_id', $this->route('gameSave')->id)],
            'asking_price' => ['required', 'integer', 'min:1'],
            'type' => ['sometimes', Rule::in(['transfer', 'loan'])],
        ];
    }
}
