# Local demo data

`seed-demo.sql` fills the **local** database with the data of the mockups (September 2026) :
candidates, stats, trades with their executions and post-mortem, account movements. It is not a
Flyway migration — nothing of it reaches production.

## Use

1. Tilt → `postgres` resource → **Purge** (empty database, migrations replayed when the backend
   restarts).
2. Log in once (or start in no-auth mode) so the user row exists.
3. Tilt → `postgres` resource → **Seed**.

By hand :

```bash
docker exec -i portfolioai-postgres psql -U portfolioai -d portfolioai -v ON_ERROR_STOP=1 < devops/local/seed-demo.sql
```

The data belongs to the first user in `app_user`. The script stops if that user already has data :
it never overwrites anything.

## Maintenance

The script follows the database schema. When a model changes, update the seed **in the same PR**, so
it stays replayable after a purge.
