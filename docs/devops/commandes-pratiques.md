# Commandes pratiques

Cheatsheet des commandes qu'on lance régulièrement pendant le dev — état BDD, gestion des jobs LLM bloqués, restart des conteneurs, inspection Ollama.

Toutes les commandes assument que la stack tourne via `tilt up` et que les conteneurs `portfolioai-postgres` et `portfolioai-ollama` sont up. Le backend Spring tourne en natif (`./gradlew bootRun`), donc il n'apparaît pas dans `docker compose ps`.

## Postgres — état des jobs LLM

Depuis le décommissionnement Phase 0 (V6), la seule table async est `ticker_narrative_job`. L'ancienne `analysis_job` (pipeline portfolio Phase 0) a été droppée — toute commande qui s'y référait est obsolète.

### Lister les jobs récents

```bash
docker compose exec postgres psql -U portfolioai -d portfolioai -c "
SELECT id, symbol, status, EXTRACT(EPOCH FROM (now() - created_at))::int AS age_sec, error
FROM ticker_narrative_job
ORDER BY created_at DESC LIMIT 10;"
```

### Marquer un PENDING zombie comme ERROR

Un Tilt restart laisse un job PENDING en BDD alors que le thread LLM est mort. Tant qu'il est PENDING, la fenêtre de dedup le retourne aux nouveaux clicks → ton nouveau click polle un job mort puis abort à 400 s. À nettoyer avant de relancer :

```bash
docker compose exec postgres psql -U portfolioai -d portfolioai -c "
UPDATE ticker_narrative_job SET status='ERROR', error='manual cleanup' WHERE status='PENDING';"
```

> Le backend a aussi un `OrphanedJobCleanupListener` qui tag automatiquement les PENDING au boot avec « Job orphaned at backend boot ». Mais il ne s'occupe que des jobs *antérieurs* au boot — un PENDING créé après reste à toi de le nettoyer.

## Ollama

### Voir l'état du daemon

Modèles loadés + `expires_at` (timeout idle = 5 min, repoussé à chaque appel) :

```bash
curl -s http://localhost:11434/api/ps | jq
```

Charge CPU / mémoire :

```bash
docker stats --no-stream portfolioai-ollama
```

> CPU > 500 % = inférence active. < 5 % = idle.

### Diagnostic « narratif lent / fan qui hurle »

Sur Docker Desktop pour Mac, Ollama tourne en **CPU pur** — Metal n'est pas exposé dans la VM Linux virtualisée. Conséquence : un narratif `qwen2.5:3b` peut saturer 9 cores ~918 % pendant 60–180 s. **C'est un trait connu, pas un bug** (cf. [`docs/devops/decision-ollama-deploiement.md`](decision-ollama-deploiement.md), décision option 3 tranchée 2026-05-09). Pour confirmer le diagnostic :

```bash
# Pendant que le narratif tourne :
docker stats --no-stream portfolioai-ollama
# CPU 900 %+ = inférence en CPU pur, comportement attendu

curl -s http://localhost:11434/api/ps | jq '.models[] | {name, expires_at}'
# expires_at qui se rapproche de "now" + 5 min = appel reçu, en cours

docker compose logs --since 1m ollama | grep "/api/chat"
# Vide = la requête est encore in-flight (le log GIN s'écrit à la complétion)
```

Si les 3 confirment, deux options : (a) attendre la fin (le job parser puis valider) ou (b) basculer sur Claude depuis `/settings/configuration > LLM > Provider = claude` pour les prochaines requêtes. Voir aussi le panneau État Ollama dans `/settings/configuration` qui surface la même info en UI.

### Logs filtrés sur les appels chat

```bash
docker compose logs --since 5m ollama | grep -E "/api/chat|level=ERROR" | tail -20
```

> Le log GIN s'écrit à la **complétion** de la requête, pas au début. Une requête en cours d'inférence n'est pas encore loggée — c'est `docker stats` qui révèle qu'Ollama mouline.

### Restart quand Ollama est dégradé

Symptômes : `/api/ps` montre un `expires_at` non-bumpé alors qu'on vient d'envoyer une requête, ou des inférences extrêmement lentes après une 500 précédente.

```bash
docker compose restart ollama
```

Les inférences en cours sont killed, les threads JVM backend reçoivent une connection-reset → `TickerNarrativeRunner.run` catche l'exception et marque le job en ERROR. Pas besoin de cleanup BDD manuel après un restart Ollama (contrairement à un Tilt restart).

### Pull un nouveau modèle

```bash
docker compose exec ollama ollama pull qwen2.5:7b
docker compose exec ollama ollama list
```

> Une fois pull, le modèle est saisissable dans le champ Ollama de `/settings/configuration > LLM`. Les suggestions Material du dropdown sont en dur côté front (`OLLAMA_MODEL_SUGGESTIONS` dans `configuration.ts`), pas une source d'autorité — saisis le tag exact que `ollama list` retourne.

### Test rapide d'un modèle sans passer par l'app

Mêmes paramètres que le bouton « Tester » de la page settings :

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:3b",
  "stream": false,
  "messages": [{"role": "user", "content": "Reply with exactly the word OK."}]
}' | jq -r '.message.content'
```

## Backend natif (gradle bootRun)

### Trouver le PID

```bash
ps aux | grep BackendApplicationKt | grep -v grep | awk '{print $2}'
```

### Health

```bash
curl -s http://localhost:8080/actuator/health | jq
```

### Thread dump (quand un appel LLM semble stuck)

```bash
PID=$(ps aux | grep BackendApplicationKt | grep -v grep | awk '{print $2}')
jstack $PID | grep -A 20 "\"task-"
```

> Les threads nommés `task-N` sont les workers du pool `@Async` (par défaut un `SimpleAsyncTaskExecutor` qui crée un thread par job). Chercher `TickerNarrativeExecutor.execute` pour confirmer qu'un appel LLM est en flight, et `NioSocketImpl.timedRead` qui dit qu'on attend la réponse Ollama / Claude.

## Stack complète

### Restart un service ciblé

```bash
docker compose restart postgres
docker compose restart ollama
```

### Reset complet (nuke les volumes Docker)

```bash
docker compose down -v
tilt up
```

> ⚠️ Supprime portfolios importés, snapshots narratifs, watchlist, et toutes les overrides runtime stockées dans `app_config` (clés API, providers, models, timeout LLM). À garder pour les vraies cassures structurelles ; pour les zombies de jobs préférer les `UPDATE ... SET status='ERROR'` ci-dessus.

### État des conteneurs

```bash
docker compose ps
```

Le backend natif n'apparaît pas — utiliser `ps aux | grep BackendApplicationKt` pour vérifier qu'il tourne.

## Tilt UI

http://localhost:10350 — vue d'ensemble (status backend / frontend / postgres / ollama, logs en live, boutons custom de pull modèle).

> Préférer `docker compose logs <service>` quand on filtre / pipe / grep ; Tilt UI est meilleur pour le scan visuel rapide.
