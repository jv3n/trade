# Maquettes

Maquettes HTML statiques pour redéfinir l'app de suivi de trading avant de la recoder.

- Ouvrir `index.html` directement dans le navigateur — aucune dépendance, aucun build.
- `assets/mockup.css` : tokens (thème sombre / clair) et composants partagés.
- `assets/mockup.js` : bascule de thème, groupes segmentés (USD / CAD, FR / EN), lignes cliquables.
- `PARCOURS.md` : le parcours utilisateur étape par étape — la référence que les maquettes suivent.
- Données fictives mais cohérentes entre les pages : les trades du journal alimentent le compte, correspondent aux lignes de stats, et la fiche candidat KTTA devient le trade du 17/09.

## Icônes

**Material Symbols Rounded** (Google Fonts). Les noms ci-dessous sont ceux à utiliser tels quels dans `<mat-icon>` dans l'app.

| Usage | Icône |
|-------|-------|
| Menu — Aujourd'hui / Compte / Candidats / Stats / Journal / Lexique | `today` · `account_balance_wallet` · `radar` · `query_stats` · `menu_book` · `dictionary` |
| Modifier / supprimer | `edit` · `delete` |
| Ajouter / dépôt / retrait | `add` · `add` · `remove` |
| Import / export CSV | `import_export` |
| Passer en stat / en trade, liens « voir » | `arrow_forward` |
| Tout passer en stats | `keyboard_double_arrow_right` |
| Jour précédent / suivant, retour | `chevron_left` · `chevron_right` · `arrow_back` |
| Étape faite, statut « En stats » | `check` |
| Thème clair / sombre | `light_mode` · `dark_mode` |
| Déposer une capture du chart | `add_photo_alternate` |

Style : trait fin (`wght` 400), contour ; l'entrée active du menu passe en icône **pleine** (`FILL` 1).
