<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTransferOfferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('play', $this->route('gameSave'));
    }

    public function rules(): array
    {
        $years = config('game.contract_years');

        return [
            'game_player_id' => ['required', 'integer', Rule::exists('game_players', 'id')->where('game_save_id', $this->route('gameSave')->id)],
            'type' => ['required', Rule::in(['transfer', 'loan', 'free_agent'])],
            'fee' => ['required_unless:type,free_agent', 'integer', 'min:0'],
            'wage' => ['required_unless:type,loan', 'integer', 'min:1'],
            'contract_years' => ['required_unless:type,loan', 'integer', "between:{$years['min']},{$years['max']}"],
            'loan_ends_on' => ['required_if:type,loan', 'date'],
        ];
    }
}
