<?php

namespace App\Http\Requests;

use App\Enums\Position;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Query string of every player list: the catalogue, a save's players and the transfer market. */
class PlayerFilterRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'search' => ['sometimes', 'string', 'max:80'],
            'position' => ['sometimes', Rule::in(Position::values())],
            'origin' => ['sometimes', Rule::in(['real', 'fictional'])],
            'nationality' => ['sometimes', 'string', 'max:60'],
            'min_age' => ['sometimes', 'integer', 'between:10,60'],
            'max_age' => ['sometimes', 'integer', 'between:10,60', 'gte:min_age'],
            'min_rating' => ['sometimes', 'integer', 'between:1,99'],
            'max_rating' => ['sometimes', 'integer', 'between:1,99', 'gte:min_rating'],
            'min_potential' => ['sometimes', 'integer', 'between:1,99'],
            'max_potential' => ['sometimes', 'integer', 'between:1,99', 'gte:min_potential'],
            'min_price' => ['sometimes', 'integer', 'min:0'],
            'max_price' => ['sometimes', 'integer', 'min:0', 'gte:min_price'],
            'club_id' => ['sometimes', 'integer'],
            'availability' => ['sometimes', Rule::in(['all', 'listed', 'free_agents'])],
            'sort' => ['sometimes', Rule::in(['overall', 'potential', 'price', 'value', 'age', 'name'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'per_page' => ['sometimes', 'integer', 'between:1,100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function perPage(): int
    {
        return (int) $this->validated('per_page', 25);
    }
}
