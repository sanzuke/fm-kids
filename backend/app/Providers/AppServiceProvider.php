<?php

namespace App\Providers;

use App\Services\Players\PlayerGenerator;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // a fresh, unseeded generator wherever one is injected
        $this->app->bind(PlayerGenerator::class, fn () => new PlayerGenerator);
    }

    public function boot(): void
    {
        //
    }
}
