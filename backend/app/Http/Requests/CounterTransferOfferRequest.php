<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CounterTransferOfferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('play', $this->route('offer')->gameSave);
    }

    public function rules(): array
    {
        $years = config('game.contract_years');

        return [
            'fee' => ['required_without_all:wage,contract_years,loan_ends_on', 'integer', 'min:0'],
            'wage' => ['sometimes', 'integer', 'min:1'],
            'contract_years' => ['sometimes', 'integer', "between:{$years['min']},{$years['max']}"],
            'loan_ends_on' => ['sometimes', 'date'],
        ];
    }
}
