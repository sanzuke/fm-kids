# Database diagram

```mermaid
erDiagram
    countries ||--o{ leagues : has
    countries ||--o{ clubs : has
    countries ||--o{ players : "nationality"
    leagues ||--o{ clubs : has
    clubs ||--o{ players : "current club"
    players ||--o{ player_external_ids : "known as"
    players ||--o{ player_careers : history
    players ||--o{ player_photos : photos

    users ||--o{ game_saves : owns
    game_saves ||--o{ game_clubs : contains
    game_saves ||--o{ game_players : contains
    clubs ||--o{ game_clubs : "copied into"
    players ||--o{ game_players : "copied into"
    game_clubs ||--o{ game_players : squad
    game_players ||--|| game_player_attributes : ratings
    game_players ||--o{ game_player_development : progress
    game_players ||--o{ game_player_contracts : contracts
    game_clubs ||--o{ game_player_contracts : employs
    game_clubs ||--o{ game_finance_transactions : ledger

    game_saves ||--o{ game_transfer_windows : has
    game_players ||--o{ game_transfer_listings : "listed as"
    game_clubs ||--o{ game_transfer_listings : lists
    game_players ||--o{ game_transfer_offers : "subject of"
    game_clubs ||--o{ game_transfer_offers : "buys / sells"
    game_transfer_listings ||--o{ game_transfer_offers : attracts
    game_transfer_offers ||--o{ game_transfer_negotiations : steps
    game_transfer_offers ||--o| game_transfers : "completed as"
    game_players ||--o{ game_transfers : moves
    game_transfers ||--o| game_loan_agreements : "loan terms"
    game_players ||--o{ game_loan_agreements : loans

    players {
        bigint id PK
        string origin "real | fictional"
        string name
        date birth_date
        bigint country_id FK
        bigint club_id FK
        string primary_position
        jsonb secondary_positions
        string preferred_foot
        string personality
        smallint base_overall
        smallint base_potential
        jsonb base_attributes
        bigint base_market_value
        bigint base_wage
    }
    player_external_ids {
        bigint player_id FK
        string provider
        string external_id "unique with provider"
    }
    game_saves {
        bigint id PK
        bigint user_id FK
        string name "unique per user"
        smallint season
        date game_date
        bigint user_game_club_id FK
    }
    game_clubs {
        bigint id PK
        bigint game_save_id FK
        bigint club_id FK
        bigint balance "never negative"
        bigint transfer_budget
        bigint wage_budget
        boolean is_user_controlled
    }
    game_players {
        bigint id PK
        bigint game_save_id FK
        bigint player_id FK
        bigint game_club_id FK "null = free agent"
        smallint squad_number
    }
    game_player_attributes {
        bigint game_player_id FK
        smallint speed
        smallint shooting
        smallint passing
        smallint dribbling
        smallint defending
        smallint stamina
        smallint overall
        smallint potential
        bigint market_value
        bigint wage_expectation
    }
    game_player_contracts {
        bigint game_player_id FK
        bigint game_club_id FK
        bigint wage
        date starts_on
        date ends_on
        string status "active | expired | terminated | transferred"
    }
    game_transfer_offers {
        bigint id PK
        bigint game_player_id FK
        bigint buying_club_id FK
        bigint selling_club_id FK "null = free agent"
        string type "transfer | loan | free_agent"
        bigint fee
        bigint wage
        smallint contract_years
        date loan_ends_on
        string status "pending | completed | rejected | withdrawn"
        string awaiting "buyer | seller | none"
    }
    game_transfers {
        bigint id PK
        bigint game_player_id FK
        bigint from_club_id FK
        bigint to_club_id FK
        bigint game_transfer_offer_id FK "unique"
        string type
        bigint fee
        date game_date
    }
    game_finance_transactions {
        bigint game_club_id FK
        string type
        bigint amount "signed"
        bigint balance_after
        string reference "the transfer it belongs to"
    }
```

## Constraints that guard the data

| Rule | Enforced by |
|---|---|
| An external record is imported once | unique (`provider`, `external_id`) on `player_external_ids`, `clubs`, `leagues` |
| A player appears once per save | unique (`game_save_id`, `player_id`) on `game_players` |
| Clubs and players in a deal, contract, listing or ledger line belong to the same save | composite foreign keys (`id`, `game_save_id`) |
| A balance or budget is never negative | check constraints on `game_clubs` |
| One running contract, one active listing, one active loan per player | partial unique indexes on `status = 'active'` |
| One open offer per club and player | partial unique index on `status = 'pending'` |
| An offer is completed once | unique `game_transfer_offer_id` on `game_transfers` |
| One user-controlled club per save | partial unique index on `game_clubs` |
| A shirt number is worn once per club | partial unique index on `game_players` |
| Positions, origins, statuses, rating ranges, date order | check constraints |
