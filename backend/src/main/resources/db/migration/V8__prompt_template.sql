-- =============================================================================
-- Phase 3 — Prompt management + scoring foundation (sub-PR1)
--
-- Persistance des prompts narratifs (jusqu'ici hardcodés en `TickerNarrativePrompt.kt`)
-- pour permettre l'édition live + l'A/B testing + le scoring continu. Cf. backlog
-- Phase 3 #1 « Prompt management + scoring » → PR1 « Schema + service backbone ».
--
-- Décisions :
--   - Une seule ligne `prompt_template` peut être active à la fois pour un même `name` (partial
--     unique index sur `is_active = TRUE`). Activer une nouvelle version = poser le nouveau row
--     à `is_active = TRUE` + flipper l'ancien à FALSE dans la même transaction.
--   - `prompt_template_id` ajouté en column nullable sur `ticker_narrative_snapshot` (pas de
--     remplacement du `prompt_version` historique : le string reste pour la trace, le FK est
--     l'autorité de lookup pour les graphes Phase 3 PR6 « stats agrégées par prompt »).
--   - Backfill des snapshots existants `prompt_version = 'v2'` vers le seed row inséré ci-dessous.
--     Les rows pré-`v2` (typiquement absents en pratique mais possible sur un dump local) restent
--     avec `prompt_template_id = NULL` — la colonne nullable absorbe ces orphelins sans pourrir
--     le schéma.
--   - `prompt_score` (ligne par run, vivante en PR2) : pré-créée ici pour que le PR2 ne touche
--     plus le schéma — il branche juste l'écriture côté `TickerNarrativeRunner`. `user_thumbs`
--     consommée en PR5, `llm_judge_score` reste null jusqu'à arbitrage user-thumbs vs LLM-judge
--     (cf. backlog ticket).
-- =============================================================================


CREATE TABLE prompt_template (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Discriminant pour avoir plusieurs *familles* de prompts (`narrative-default`,
    -- `portfolio-aggregator` Phase 4, `news-summarizer` futur…). v1 single family.
    name            VARCHAR(100) NOT NULL,
    -- Tag libre pour la lisibilité côté UI Phase 3 PR3 — `'v2'`, `'v3-bullish-bias-fix'`, etc.
    -- Pas de contrainte d'unicité (deux versions consécutives peuvent porter le même tag si on
    -- corrige une typo sans changer la sémantique du prompt).
    version         VARCHAR(50)  NOT NULL,
    system_prompt   TEXT         NOT NULL,
    -- `user_template` : volontairement nullable. La construction du user message vit aujourd'hui
    -- côté Kotlin (`buildNarrativeUserMessage` dans `TickerNarrativePrompt.kt`) parce que
    -- l'interpolation des indicateurs est conditionnelle (skip null silencieusement, format BigDecimal
    -- spécifique). Quand on basculera sur un templating type Mustache, ce champ portera la string ;
    -- en attendant, `null` = utiliser le builder Kotlin.
    user_template   TEXT,
    -- Cible model facultative pour qu'un prompt puisse être réservé à Claude vs Ollama si on
    -- découvre que la même string ne donne pas le même résultat sur les deux backends. v1 : null
    -- partout = "n'importe quel modèle".
    target_model    VARCHAR(100),
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    activated_at    TIMESTAMPTZ,
    deprecated_at   TIMESTAMPTZ,
    notes           TEXT
);

-- Au plus une ligne active par `name` à la fois — flipper actif/inactif est atomique côté
-- service (set old to FALSE, set new to TRUE in same txn).
CREATE UNIQUE INDEX idx_prompt_template_active_per_name
    ON prompt_template(name) WHERE is_active = TRUE;

-- Lookup principal du service : "donne-moi le prompt actif pour `narrative-default`" — couvert
-- par l'index unique partiel ci-dessus. Un index secondaire sur `(name, deprecated_at DESC)`
-- aiderait pour la liste historique de l'UI mais c'est de la lecture rare ; on ajoute si la page
-- PR3 monte en volume.


CREATE TABLE prompt_score (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Snapshot référencé : nullable pour que les runs ratés (parser/validator KO sur les deux
    -- attempts) puissent quand même persister un score qui pin la latence + retry_count + flags
    -- d'erreur. Sans cette nullabilité, on perdrait le signal des cas qui nous intéressent le plus
    -- (les échecs).
    snapshot_id          UUID         REFERENCES ticker_narrative_snapshot(id) ON DELETE SET NULL,
    -- Prompt utilisé pour ce run. Required : un score sans prompt n'a pas de sens analytique.
    prompt_template_id   UUID         NOT NULL REFERENCES prompt_template(id) ON DELETE RESTRICT,
    latency_ms           INTEGER      NOT NULL,
    -- 0 = succès au premier coup, 1 = retry après parse/validator failure, max 1 today (cf.
    -- `MAX_ATTEMPTS = 2` côté `TickerNarrativeExecutor`).
    retry_count          INTEGER      NOT NULL DEFAULT 0,
    parse_failed         BOOLEAN      NOT NULL DEFAULT FALSE,
    validator_failed     BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Feedback user PR5 : -1 / 0 / +1 (default 0 = pas de feedback). Smallint pour tenir dans
    -- 2 octets — on n'aura jamais besoin de plus de 3 valeurs.
    user_thumbs          SMALLINT     NOT NULL DEFAULT 0
        CHECK (user_thumbs IN (-1, 0, 1)),
    -- Phase 3 future : LLM-as-judge note la sortie de qwen avec Claude. Range arbitraire pour
    -- l'instant (par convention 0..100, à pinner quand on cable l'évaluateur).
    llm_judge_score      NUMERIC(5,2),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookup principal Phase 3 PR6 : « stats agrégées pour un prompt » → group by prompt_template_id.
CREATE INDEX idx_prompt_score_prompt_template
    ON prompt_score(prompt_template_id, created_at DESC);

-- Lookup secondaire PR5 : « le score lié à ce snapshot » pour mettre à jour `user_thumbs` quand
-- l'utilisateur clique 👍/👎 sur le dossier ticker. Une ligne par snapshot dans le flow normal.
CREATE INDEX idx_prompt_score_snapshot
    ON prompt_score(snapshot_id);


-- Ajout du FK sur `ticker_narrative_snapshot`. Nullable parce que les snapshots créés AVANT
-- cette migration n'ont pas de template référencé (ils portent le tag string `prompt_version`
-- mais aucune ligne `prompt_template` ne précède V8). Le backfill ci-dessous remplit la colonne
-- pour les snapshots `v2` ; les `v1` restent NULL.
ALTER TABLE ticker_narrative_snapshot
    ADD COLUMN prompt_template_id UUID
        REFERENCES prompt_template(id) ON DELETE SET NULL;

CREATE INDEX idx_ticker_narrative_snapshot_prompt_template
    ON ticker_narrative_snapshot(prompt_template_id);


-- Seed du prompt v2 actif : copie verbatim du `NARRATIVE_SYSTEM_PROMPT` (string Kotlin
-- `internal val` dans `TickerNarrativePrompt.kt`, après `.trimIndent()`). Dollar-quoted pour
-- éviter le pénible escape des apostrophes ("ticker's", "it's missing").
WITH seeded AS (
    INSERT INTO prompt_template (name, version, system_prompt, is_active, activated_at)
    VALUES (
        'narrative-default',
        'v2',
        $prompt$You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.

Reply with ONLY this JSON object (no prose, no markdown fences) :
{
  "summary": "2-3 sentences describing posture: price vs MAs, RSI, momentum, drawdown. Neutral tone, no forecasts.",
  "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
  "keyPoints": ["3-5 bullets, each ≤15 words, each grounded in one indicator value from the input. No invented numbers."]
}

Sentiment rule: price above MA200 + positive momentum + RSI 50-70 → BULLISH ; price below MA200 + negative momentum + deep drawdown → BEARISH ; otherwise NEUTRAL.

If an indicator is null in the input (series too short), skip it silently — never mention it's missing.$prompt$,
        TRUE,
        now()
    )
    RETURNING id
)
-- Backfill des snapshots `v2` existants vers le seed row.
UPDATE ticker_narrative_snapshot
SET prompt_template_id = (SELECT id FROM seeded)
WHERE prompt_version = 'v2';
