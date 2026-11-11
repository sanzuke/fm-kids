<?php

namespace Tests\Support;

/** Made-up API-Football answers in the real response shape. */
trait ApiFootballFixtures
{
    protected function apiBody(array $response, int $page = 1, int $pages = 1, array $errors = []): array
    {
        return ['get' => 'test', 'errors' => $errors, 'results' => count($response), 'paging' => ['current' => $page, 'total' => $pages], 'response' => $response];
    }

    protected function apiLeague(int $id = 900, string $name = 'Test Premier Division'): array
    {
        return ['league' => ['id' => $id, 'name' => $name, 'type' => 'League'], 'country' => ['name' => 'Testland', 'code' => 'TL'], 'seasons' => []];
    }

    protected function apiClub(int $id, string $name): array
    {
        return ['team' => ['id' => $id, 'name' => $name, 'code' => strtoupper(substr($name, 0, 3)), 'country' => 'Testland'], 'venue' => []];
    }

    protected function apiPlayer(int $id, string $name = 'T. Sample', array $overrides = []): array
    {
        return [
            'player' => array_merge([
                'id' => $id, 'name' => $name, 'firstname' => 'Tomas Example', 'lastname' => 'Sample', 'age' => 24,
                'birth' => ['date' => '2002-03-14', 'place' => 'Test City', 'country' => 'Testland'],
                'nationality' => 'Testland', 'height' => '181 cm', 'photo' => "https://media.example.test/players/$id.png",
            ], $overrides['player'] ?? []),
            'statistics' => $overrides['statistics'] ?? [[
                'team' => ['id' => 501, 'name' => 'Test Rovers'],
                'league' => ['id' => 900, 'name' => 'Test Premier Division', 'season' => 2024],
                'games' => ['appearences' => 30, 'minutes' => 2400, 'position' => 'Attacker', 'rating' => '7.200000'],
                'goals' => ['total' => 12, 'assists' => 5],
            ]],
        ];
    }

    protected function apiTransfers(int $playerId): array
    {
        return [[
            'player' => ['id' => $playerId, 'name' => 'T. Sample'],
            'transfers' => [
                ['date' => '2023-07-01', 'type' => '€ 2M', 'teams' => ['in' => ['id' => 501, 'name' => 'Test Rovers'], 'out' => ['id' => 777, 'name' => 'Old Town']]],
                ['date' => '2021-01-15', 'type' => 'Loan', 'teams' => ['in' => ['id' => 777, 'name' => 'Old Town'], 'out' => ['id' => 778, 'name' => 'Youth Club']]],
            ],
        ]];
    }
}
