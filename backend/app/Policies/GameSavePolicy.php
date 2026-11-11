<?php

namespace App\Policies;

use App\Models\GameSave;
use App\Models\User;

class GameSavePolicy
{
    public function view(User $user, GameSave $save): bool
    {
        return $save->user_id === $user->id;
    }

    /** Playing a save (offers, listings...) is for its owner only. */
    public function play(User $user, GameSave $save): bool
    {
        return $save->user_id === $user->id;
    }
}
