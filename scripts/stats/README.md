# scripts/stats — transformateur de stats sheet → CSV d'import

Convertit un copier-coller brut (tab-separated) de la Google Sheet de stats trade en CSV prêt pour
`POST /api/stats/import` (décodeur backend : `StatEntryCsvDecoder`).

## Workflow (récurrent — à refaire chaque mois)

**1.** Écrase **`input/input.txt`** avec le nouveau copier-coller de l'Excel (le mois à jour).

**2.** Lance le script — bouton **▶ dans l'IDE** (sur `main.go`), ou en CLI :

```bash
go run .
```

**3.** **`output/stats-data-prod.csv`** est régénéré (le run **écrase** le précédent), prêt pour
`POST /api/stats/import`.

> Les chemins (`input/input.txt` → `output/stats-data-prod.csv`) sont en dur, résolus **relativement
> à `main.go`** (pas au répertoire courant), donc le ▶ marche quel que soit le working directory.

`input/` et `output/` sont **gitignored** (sauf `.gitkeep`), ainsi que le binaire compilé — ta donnée
mensuelle reste locale, rien n'est commité. Le format attendu est documenté ci-dessous + en tête de
`main.go`.

Seule option :

```bash
go run . -tol 0.5   # seuil d'alerte de drift (défaut 0.5)
```

`-tol` = écart max (en points de %) entre le `%push`/`%LOD`/`%EOD` **recalculé** depuis les prix et
celui de la feuille, avant de lever un avertissement (self-check d'alignement des colonnes).

## Tests

```bash
go test .
```

## Ce que fait la transformation

- `Gap Up` / `Institutions %` → `%` retiré (`61%` → `61`)
- `Float` → suffixe `M`/`m` retiré (`4.7m` → `4.7`, millions)
- prix → `$` et espaces retirés (`$1.07` et `1.16 $` tolérés)
- `yes`/`no`/vide → `true`/`false` (vide → `false`)
- colonnes **Push / %LOD / %EOD jetées** — recalculées par le backend à l'insert (`StatMetrics`)
- `Notes` requotées si elles contiennent une virgule

## Ce qui est écarté (et reporté)

- lignes avec un prix Open/High/LOD/EOD manquant ou ≤ 0 (ex. ticker halté, LOD/EOD vides)
- lignes placeholder (date + ticker seulement)
- tables au schéma **« B Play »** (colonne `B Play` au lieu des 4 flags) — non mappable

Le mapping colonne par colonne est documenté en tête de `main.go`.
