-- =============================================================================
-- V2 — Reset narrative prompt to body-only (2026-05-22)
-- =============================================================================
-- Phase 3 refactor : the narrative prompt is now stored as a *body* only (the
-- persona / tone / focus, editable from /settings/prompts). The technical
-- envelope (JSON output contract, sentiment rule, null-skip rule, length
-- ceiling) lives in code (`TickerNarrativePrompt.kt > NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX`)
-- and is appended at runtime by `TickerNarrativeExecutor`. This guarantees that
-- (a) the user cannot accidentally break the JSON contract by editing the prompt,
-- (b) even a one-word body like "bonjour" still produces parseable JSON.
--
-- This migration UPDATEs the currently active `narrative-default` row in place so
-- that the live prompt switches to the new body-only model at boot time, without
-- leaving a broken FK reference from `ticker_narrative_snapshot.prompt_template_id`.
-- Historical (inactive) rows still carry their old full-prompt content for audit
-- — reactivating one via /settings/prompts after this migration would double the
-- JSON contract with the envelope and produce broken LLM input ; we mark them
-- deprecated so the UI flags them as stale.
-- =============================================================================

UPDATE prompt_template
SET
    system_prompt = $body$You are a financial writer. Given one ticker's current price and pre-computed indicators, produce a short factual technical summary — describe what the indicators show, no predictions, no buy/sell advice.$body$,
    version = 'v3-body-only',
    notes = 'Reset to body-only on V2 (2026-05-22). The technical envelope (JSON contract, sentiment rule, length ceiling) is now appended in code by TickerNarrativeExecutor. Edit only the persona / tone here ; the contract cannot be overridden from the UI.'
WHERE name = 'narrative-default'
  AND is_active = TRUE;

-- Mark all pre-existing inactive rows as deprecated (if not already), so the UI
-- flags them as stale. Reactivating them would feed the LLM the old full prompt
-- + the new envelope, producing duplicate JSON contracts — best avoided.
UPDATE prompt_template
SET deprecated_at = COALESCE(deprecated_at, now())
WHERE name = 'narrative-default'
  AND is_active = FALSE
  AND deprecated_at IS NULL;
