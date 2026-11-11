<?php

/*
| Settings for App\Services\Players\PlayerGenerator.
| Every "weights" list maps a choice to how often it is drawn, relative to the others.
*/
return [
    // nation code => name; seeded into the countries table
    'countries' => [
        'IDN' => 'Indonesia', 'BRA' => 'Brazil', 'ARG' => 'Argentina', 'ENG' => 'England', 'ESP' => 'Spain',
        'FRA' => 'France', 'GER' => 'Germany', 'ITA' => 'Italy', 'NED' => 'Netherlands', 'JPN' => 'Japan',
        'NGA' => 'Nigeria', 'BEL' => 'Belgium', 'COL' => 'Colombia', 'SWE' => 'Sweden',
    ],
    'nationality_weights' => [
        'IDN' => 3, 'BRA' => 3, 'ARG' => 3, 'ENG' => 3, 'ESP' => 3, 'FRA' => 3, 'GER' => 3, 'ITA' => 3,
        'NED' => 2, 'JPN' => 2, 'NGA' => 2, 'BEL' => 2, 'COL' => 2, 'SWE' => 1,
    ],

    'position_weights' => ['GK' => 9, 'CB' => 17, 'LB' => 8, 'RB' => 8, 'CDM' => 8, 'CM' => 16, 'CAM' => 8, 'LW' => 7, 'RW' => 7, 'ST' => 12],

    // how many extra positions a player has, and which ones are likely next to the main one
    'secondary_count_weights' => [0 => 50, 1 => 38, 2 => 12],
    'secondary_position_weights' => [
        'GK' => [],
        'CB' => ['LB' => 2, 'RB' => 2, 'CDM' => 3],
        'LB' => ['CB' => 2, 'LW' => 3, 'RB' => 1],
        'RB' => ['CB' => 2, 'RW' => 3, 'LB' => 1],
        'CDM' => ['CB' => 2, 'CM' => 4],
        'CM' => ['CDM' => 3, 'CAM' => 3],
        'CAM' => ['CM' => 3, 'LW' => 1, 'RW' => 1, 'ST' => 2],
        'LW' => ['RW' => 3, 'ST' => 2, 'CAM' => 1, 'LB' => 1],
        'RW' => ['LW' => 3, 'ST' => 2, 'CAM' => 1, 'RB' => 1],
        'ST' => ['LW' => 2, 'RW' => 2, 'CAM' => 2],
    ],

    // [youngest, oldest, weight]
    'age_bands' => [[15, 17, 10], [18, 21, 25], [22, 26, 30], [27, 30, 22], [31, 35, 13]],

    'foot_weights' => ['right' => 70, 'left' => 24, 'both' => 6],
    // positions that favour a foot replace the general weights
    'foot_weights_by_position' => [
        'LB' => ['left' => 65, 'right' => 25, 'both' => 10],
        'LW' => ['left' => 50, 'right' => 40, 'both' => 10],
    ],

    'personality_weights' => ['team_player' => 25, 'hard_worker' => 22, 'ambitious' => 15, 'joker' => 14, 'leader' => 10, 'shy' => 8, 'cool_head' => 6],

    // overall rating is drawn around the mean; "spread" is the largest distance from it
    'overall' => ['mean' => 54, 'spread' => 20, 'min' => 30, 'max' => 90],

    // potential = overall + growth, by age: [oldest age, least growth, most growth]
    'growth_by_age' => [[18, 8, 22], [21, 5, 16], [25, 1, 8], [29, 0, 3], [99, 0, 0]],

    // attributes in this order; each position's weights add up to 1 and give its overall rating
    'attributes' => ['speed', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'],
    'attribute_weights' => [
        'GK' => [0.10, 0.00, 0.10, 0.10, 0.60, 0.10],
        'CB' => [0.12, 0.03, 0.10, 0.05, 0.55, 0.15],
        'LB' => [0.20, 0.05, 0.15, 0.10, 0.35, 0.15],
        'RB' => [0.20, 0.05, 0.15, 0.10, 0.35, 0.15],
        'CDM' => [0.10, 0.05, 0.20, 0.10, 0.40, 0.15],
        'CM' => [0.10, 0.10, 0.30, 0.20, 0.15, 0.15],
        'CAM' => [0.10, 0.20, 0.25, 0.30, 0.05, 0.10],
        'LW' => [0.25, 0.20, 0.15, 0.30, 0.02, 0.08],
        'RW' => [0.25, 0.20, 0.15, 0.30, 0.02, 0.08],
        'ST' => [0.20, 0.45, 0.05, 0.20, 0.00, 0.10],
    ],
    // how strongly a position's key attributes stand out, and the random wobble on each attribute
    'attribute_emphasis' => 70,
    'attribute_noise' => 12,
    'attribute_min' => 12,
    'attribute_max' => 97,

    // market value = base * e^((overall - pivot) * growth), then potential and age factors
    'value' => ['base' => 50, 'pivot' => 40, 'growth' => 0.085, 'potential_bonus' => 0.012, 'minimum' => 10],
    // weekly wage a player expects, as a share of market value
    'wage_ratio' => 0.02,

    'first_names' => [
        'Rafa', 'Leo', 'Bima', 'Toby', 'Max', 'Kiko', 'Nico', 'Dani', 'Oli', 'Zack', 'Finn', 'Gabe', 'Hugo', 'Ivan', 'Joni',
        'Kai', 'Lio', 'Milo', 'Ned', 'Otto', 'Pip', 'Quin', 'Remy', 'Sami', 'Tino', 'Uki', 'Vito', 'Wiko', 'Yuri', 'Zeno',
        'Arlo', 'Bram', 'Cody', 'Dexi', 'Eli', 'Fabi', 'Gino', 'Hans', 'Ilo', 'Jayo', 'Kobi', 'Luca', 'Mati', 'Niko', 'Omar',
        'Pablo', 'Rio', 'Stevo', 'Tomo', 'Ugo', 'Vin', 'Wali', 'Xavi', 'Yoga', 'Ziggy', 'Adi', 'Bagas', 'Citra', 'Dimas', 'Eko',
    ],
    'last_names' => [
        'Bintang', 'Rocket', 'Swift', 'Lightfoot', 'Goalie', 'Striker', 'Sparks', 'Bouncy', 'Zoom', 'Cheeky', 'Brave', 'Mighty',
        'Speedy', 'Lucky', 'Jolly', 'Sunny', 'Windy', 'Fuzzy', 'Zesty', 'Dazzle', 'Thunder', 'Comet', 'Dribble', 'Hopper',
        'Kicker', 'Blaze', 'Wonder', 'Turbo', 'Gallop', 'Sprint', 'Pepper', 'Maple', 'Cloud', 'Pebble', 'Wiggle', 'Shadow',
        'Nimble', 'Rumble', 'Giggle', 'Spark', 'Banjo', 'Cosmo', 'Doodle', 'Fizz', 'Gizmo', 'Jinx', 'Kazoo', 'Mambo', 'Noodle', 'Pogo',
    ],
];
