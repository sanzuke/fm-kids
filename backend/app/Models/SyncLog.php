<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One run of an external synchronisation, kept for troubleshooting. */
class SyncLog extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['params' => 'array', 'started_at' => 'datetime', 'finished_at' => 'datetime'];
    }
}
