# Données de démo locales

`seed-demo.sql` remplit la base **locale** avec les données des maquettes (septembre 2026) : candidats, stats, trades avec exécutions et post-mortem, mouvements du compte. Ce n'est pas une migration Flyway : rien ne part en prod.

## Utilisation

1. Tilt → ressource `postgres` → **Purge** (base vide, migrations rejouées au redémarrage du backend).
2. Se connecter une fois dans l'app (ou démarrer en mode no-auth) pour que l'utilisateur existe.
3. Tilt → ressource `postgres` → **Seed**.

À la main :

```bash
docker exec -i portfolioai-postgres psql -U portfolioai -d portfolioai -v ON_ERROR_STOP=1 < devops/local/seed-demo.sql
```

Les données appartiennent au premier utilisateur de `app_user`. Le script s'arrête s'il a déjà des données : il n'écrase jamais rien.

## Maintenance

Le script suit le schéma de la base. Quand un modèle change (issues de la refonte #186, #187, #192…), mettre le seed à jour **dans la même PR**, pour qu'il reste rejouable après une purge.
