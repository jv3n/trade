# Local demo data

`seed-demo.sql` fills the **local** database with the data of the mockups (September 2026) :
candidates, stats, trades with their executions and post-mortem, account movements. It is not a
Flyway migration — nothing of it reaches production.

## Use

1. Tilt → `postgres` resource → **Purge** (empty database, migrations replayed when the backend
   restarts).
2. Log in once so the user row exists.
3. Tilt → `postgres` resource → **Seed**.

By hand :

```bash
docker exec -i portfolioai-postgres psql -U portfolioai -d portfolioai -v ON_ERROR_STOP=1 < devops/local/seed-demo.sql
```

The data belongs to the first user in `app_user`. The script stops if that user already has data :
it never overwrites anything.

## Moving to a new Postgres major

A data volume only starts under the major that created it : after a bump of the image in
`docker-compose.yml` (16 → 17 in #410), **Purge** can't help, the container doesn't boot. Drop the
volume, then start again — the migrations replay, and the demo data comes back with **Seed** :

```bash
tilt down && docker compose down -v && tilt up
```

## Maintenance

The script follows the database schema. When a model changes, update the seed **in the same PR**, so
it stays replayable after a purge.
