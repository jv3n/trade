-- A locate reaches the account as its own movement (#602). Alone in its migration : Postgres refuses
-- to use an enum value in the transaction that added it, and V20 / the account sync rely on it.
ALTER TYPE account_movement_type ADD VALUE 'LOCATE';
