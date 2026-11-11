<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Creates either a structured save from the catalogue (club_id) or a cloud save that carries
 * the game's own world document (world). Exactly one of the two shapes is expected.
 */
class StoreGameSaveRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            // the catalogue club the player will manage, for a structured save
            'club_id' => ['required_without:world', 'nullable', 'integer', 'exists:clubs,id'],
            'world' => ['required_without:club_id', 'nullable', 'array'],
            'world.v' => ['required_with:world', 'integer', 'min:1'],
            'world.seed' => ['required_with:world', 'integer'],
            'world.season' => ['required_with:world', 'integer', 'min:1'],
            'world.userClub' => ['required_with:world', 'integer', 'min:0'],
            'world.clubs' => ['required_with:world', 'array', 'min:1'],
            'world.players' => ['required_with:world', 'array', 'min:1'],
        ];
    }
}
