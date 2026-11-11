<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Replaces the world document of a cloud save (the whole playthrough, as the game writes it). */
class UpdateGameSaveRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'world' => ['required', 'array'],
            'world.v' => ['required', 'integer', 'min:1'],
            'world.seed' => ['required', 'integer'],
            'world.season' => ['required', 'integer', 'min:1'],
            'world.userClub' => ['required', 'integer', 'min:0'],
            'world.clubs' => ['required', 'array', 'min:1'],
            'world.players' => ['required', 'array', 'min:1'],
        ];
    }
}
