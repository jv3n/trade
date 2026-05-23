# Analyse DNS — choix du nom de domaine prod

> **Reco finale** : `tickerstory.org` via **Cloudflare Registrar**, ~**$7.50/an** (renouvellement au même prix, at-cost). Plan B : `tickerstory.dev` à $10.18/an si `.org` indisponible. Vérifier la dispo réelle sur [domains.cloudflare.com](https://domains.cloudflare.com/) avant l'achat — l'état change quotidiennement.
>
> Document produit le 2026-05-22 pour débloquer le ticket Cloudflare proxy/cache de Phase 5 (cf. [`backlog.md > Phase 5`](../projet/backlog.md#phase-5--déploiement)). Hors-scope ici : achat + transfert DNS — c'est le ticket suivant qui les fait. **Historique de pivot** : reco initiale `tickerstory.app` ($14.20), abandonnée le 2026-05-22 après que le nom soit constaté pris en `.app` ; `.us` à $6.50 envisagée puis écartée pour la US Nexus Requirement (cf. tableau TLD ci-dessous) ; `.org` à $7.50 retenu — universel, sans condition d'éligibilité, et $6.70/an moins cher que la reco d'origine.

---

## Contraintes

| Contrainte | Valeur |
|------------|--------|
| Budget annuel max | **15 USD** (cohérent avec discipline $0/mo Phase 5) |
| Positionnement brand | « Narrateur de marché, pas devin » — le nom doit évoquer écriture / lecture / journal, pas signal / prédiction |
| Localisation | Montréal (compute Cloud Run `northamerica-northeast1`), audience FR + EN |
| Registrar DNS cible | Cloudflare (pour le proxy + cache + bypass egress du ticket suivant) |
| TLD compatible Cloudflare DNS gratuit | Tous les TLDs courants — non bloquant |

---

## Brainstorm noms candidats

10 alternatives autour du positionnement narrateur, ordonnées par préférence subjective (clarté + facilité de prononciation + scan visuel) :

| # | Nom | Pourquoi |
|---|-----|----------|
| 1 | **tickerstory** | Métaphore narrateur directe — story = narrative ; court, scan-friendly, ASCII pur |
| 2 | **marketscribe** | Scribe = écrivain factuel, pas oracle ; distinctif, peu d'occurrences existantes |
| 3 | **ledgerlens** | Alliération, ledger (livre comptable) + lens (perspective) — élégant mais un peu abstrait |
| 4 | **tickernote** | Concis, vibe carnet d'analyse ; risque de confusion avec apps de notes génériques |
| 5 | **stockscribe** | Variante #2 plus financière ; « stock » est plus lourd que « market » à l'oral |
| 6 | **dossierticker** | Clin d'œil FR/Montréal ; long, et « dossier » est moins universel en EN |
| 7 | **tickertale** | Variant de #1, légèrement plus rétro |
| 8 | **stocknarrator** | Explicite mais lourd à taper (13 chars) |
| 9 | **equitynote** | Minimaliste financial ; « equity » a une connotation institutionnelle |
| 10 | **portfolioai** | Naming actuel du projet — backup si tout le reste est pris ou trop cher |

> Tous les candidats ASCII-only, pas d'IDN, pas de tiret — la dispo doit être checkée TLD par TLD, certains noms courants peuvent être squattés en `.com` même si libres en `.app` / `.dev`.

---

## TLD — comparaison prix + image

Prix Cloudflare Registrar relevés le 2026-05-22 sur [cfdomainpricing.com](https://cfdomainpricing.com/) (Cloudflare publie at-cost = prix coûtant registre, sans markup). Tous les TLDs listés sont sous le cap 15 USD.

| TLD | Cloudflare (reg / renouv.) | Image | Bonus / Risque |
|-----|----------------------------|-------|----------------|
| **.org** ★ **reco actuelle** | **$7.50 / $7.50** | Universelle, trust-y (Wikipedia, Mozilla, Apache) | ✅ Aucune condition d'éligibilité, registry Public Interest Registry (ICANN-supervisé, stable). Vibe légèrement « non-profit / projet community » — aligné au positionnement narrateur perso (pas de prétention SaaS commercial). Pas de HSTS preload mais TLS reste standard de facto en 2026 |
| **.us** | **$6.50 / $6.50** | Géographique US | ❌ **US Nexus Requirement** : le registrant doit certifier être citoyen/résident US, entité incorporée aux US, OU entité étrangère avec « bona fide US presence » (activité commerciale régulière aux US). Pour un résident Montréal sans activité US, aucune des 3 catégories ne s'applique honnêtement. Risque concret : le registry peut **challenger et suspendre** le domaine. Enforcement laxiste en pratique, mais incompatible avec une identité brand long terme. **Écarté malgré le prix le plus bas** |
| **.dev** | **$10.18 / $10.18** | Tech, dev-tool, Google-owned | ✅ **HSTS preload list forcée** = TLS obligatoire au browser sans config. Risque mineur : « dev » peut être perçu comme outil de dev plutôt que produit |
| **.com** | **$10.46 / $10.46** | Classique, neutre, recognizable | Squat fréquent — souvent indisponible sur les noms courts. Pas de bonus particulier |
| **.ca** | **$9.19 / $9.19** | Canadien, local Montréal | ✅ Pertinent si on cible une audience CA-only ; pas de condition d'éligibilité bloquante pour un résident CA. Risque : audience hors-CA percevra le TLD comme géo-restreint |
| **.app** | **$14.20 / $14.20** | Moderne, vibe webapp, Google-owned | ✅ HSTS preload list forcée (même bonus que `.dev`) — le plus cher de la liste, justifié seulement si le bonus webapp prime sur le prix |
| **.xyz** | **$12.30 / $11.20** | Moderne, cheap | Image moins pro (~connotation startup jetable) ; renouv. plus cher que reg |
| .fr | — | Français | ❌ **Pas dispo sur Cloudflare Registrar.** Il faudrait OVH (~$8) ou Gandi (~$15) en registrar séparé puis pointer les nameservers vers Cloudflare. Friction supplémentaire |

**TLDs écartés** : `.io` (~$30/an), `.ai` (~$80-200/an + complexité géopolitique Anguilla) — au-dessus du budget.

---

## Registrar — comparaison

| Registrar | Modèle prix | WHOIS privacy | Pourquoi (ou pas) |
|-----------|-------------|---------------|-------------------|
| **Cloudflare Registrar** ★ reco | **At-cost, zéro markup** | Gratuit, activé par défaut | Reg + renouv. au prix coûtant registre, jamais d'upsell. Intégration native avec le proxy/cache Cloudflare du ticket suivant (1 seul compte, 1 seule UI). TLDs limités (~400) mais couvre tous nos candidats hors `.fr`. **Aucun markup → coût total à long terme le plus bas** |
| Porkbun | Markup léger ~$0.50-1 | Gratuit, activé par défaut | UX propre, auto-renew sain, support honnête. ~5-25 % plus cher que Cloudflare sur tous les TLDs ici (e.g. .app à $14.93 vs $14.20). Pertinent uniquement si on veut un TLD non supporté par Cloudflare |
| Namecheap | Markup ~$1-3 | Inclus 1ère année, payant après | UX correcte, populaire. Plus cher que Porkbun et Cloudflare, WHOIS privacy payant en renouvellement = piège |
| OVH | Variable, FR-friendly | Inclus | Pertinent uniquement pour `.fr` (un de nos écartés). Registrar français, UX en FR, mais markup et UX inférieurs à Cloudflare sur les TLDs internationaux |
| GoDaddy | Markup élevé + upsells aggressifs | Payant | ❌ Évité — UX pollutive, prix volatils, mauvaise réputation dans la communauté dev |

---

## Reco finale

### Choix #1 — `tickerstory.org` chez Cloudflare Registrar

- **Coût** : $7.50/an reg + $7.50/an renouvellement (jamais de hike post-1ère année — Cloudflare est at-cost). Le **2e moins cher** des TLDs viables après `.us` (écarté pour nexus).
- **Aucune condition d'éligibilité** — Public Interest Registry (PIR) sous supervision ICANN ; registrant peut être n'importe qui n'importe où, contrairement à `.us` (US nexus required) ou `.ca` (CIRA Canadian Presence requirement, applicable ici mais inutile à se rajouter).
- **Image** : universelle, trust-y, association historique avec projets sérieux open-source / non-profits / communauté tech (Wikipedia, Mozilla, Apache, Linux Foundation). Pour un projet perso de narratif de marché en discipline « narrateur, pas vendeur », la vibe community/utility est même un alignement net.
- **Branding** : narrative directe (story = histoire = narrateur), prononciation EN/FR sans piège, 12 caractères (tient sur carte de visite, logo, URL bar mobile).
- **Trade-off accepté** : pas de HSTS preload (contrairement à `.app`/`.dev`). Impact mineur en 2026 — TLS est de facto obligatoire (warnings browsers sur HTTP, Let's Encrypt automatisé, Cloudflare ajoute le strict-transport-security header côté reverse proxy en 1 clic). Le bonus HSTS preload TLD-level n'est qu'une ceinture-bretelle.
- **Lien d'achat** : [domains.cloudflare.com](https://domains.cloudflare.com/) → search `tickerstory.org`

### Plan B — `tickerstory.dev` chez Cloudflare

Si `.org` indisponible (peu probable, mais possible — `.org` reste largement ouvert sur les noms courts) : `.dev` à **$10.18/an**, bonus HSTS preload, même registrar. Risque : « dev » peut être perçu comme « outil de dev » plutôt que « produit fini ».

### Plan C — `tickerstory.ca` chez Cloudflare

Si les deux précédents indisponibles : `.ca` à **$9.19/an**, légitimité automatique pour un résident Montréal, ancrage local fort. Risque : audience hors-CA percevra le TLD comme géo-restreint.

### Plan D — cascade nom alternatif sur `.org`

Si `tickerstory.*` complètement pris (improbable), itérer sur la shortlist dans l'ordre : `marketscribe` → `ledgerlens` → `tickernote` → `dossierticker`. Tester d'abord `.org` (le plus permissif côté éligibilité + le moins cher hors `.us`).

### Pourquoi pas `.us` malgré le prix ($6.50)

Le moins cher du tableau, mais le registry exige une **US Nexus Requirement** (catégorie de registrant : citoyen/résident US, entité incorporée US, ou entité étrangère avec activité commerciale US substantielle). Pour un résident Montréal sans business US, aucune des 3 catégories ne tient honnêtement. Risque concret : challenge du registry → suspension du domaine. Enforcement est laxiste en pratique (beaucoup de non-US ont des `.us`), mais c'est un risque latent incompatible avec une identité brand stable long terme. $1 d'économie par an vs `.org` ne le justifie pas. Documenté pour éviter de retomber dans le piège à la prochaine lecture.

---

## Vérifications avant achat

1. **Dispo réelle** — checker sur [domains.cloudflare.com](https://domains.cloudflare.com/) au moment de l'achat. L'état change quotidiennement (drops + squats). WHOIS via `whois tickerstory.app` en CLI donne aussi une indication.
2. **WHOIS privacy** — confirmer qu'elle est activée par défaut (Cloudflare l'inclut sans demande explicite). Sans ça, ton email + adresse seraient publics.
3. **Account 2FA** — activer la 2FA sur le compte Cloudflare avant le 1er achat de domaine. Un domaine perdu se récupère mal.
4. **Auto-renew** — activé par défaut chez Cloudflare. Garder activé sauf décision contraire — l'oubli de renouvellement = perte du domaine + parking pendant 30 jours puis re-vente.
5. **Email registrant** — utiliser un email que tu lis (les notifications de renouvellement + abuse y arrivent). Pas un alias qu'on oublie.

---

## Étapes suivantes (hors-scope ce doc)

Une fois le domaine acheté, le ticket [Cloudflare devant Cloud Run](../projet/backlog.md#phase-5--déploiement) prend le relais : transfert DNS chez Cloudflare (déjà fait par défaut si registrar Cloudflare), CNAME proxifié vers le service Cloud Run, custom domain mapping, cache rules sur les assets statiques, redirect URI Google OAuth mise à jour. ~1-2 h estimées.
