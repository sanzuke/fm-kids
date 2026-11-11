<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameTransferWindow extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['opens_on' => 'date', 'closes_on' => 'date'];
    }
}
