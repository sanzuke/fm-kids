<?php

namespace App\Enums;

/** The ten positions the game's match engine understands. */
enum Position: string
{
    case GK = 'GK';
    case CB = 'CB';
    case LB = 'LB';
    case RB = 'RB';
    case CDM = 'CDM';
    case CM = 'CM';
    case CAM = 'CAM';
    case LW = 'LW';
    case RW = 'RW';
    case ST = 'ST';

    /** @return list<string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /** SQL list for CHECK constraints: 'GK','CB',... */
    public static function sqlList(): string
    {
        return "'".implode("','", self::values())."'";
    }
}
