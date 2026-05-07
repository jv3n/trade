package com.portfolioai.analysis.domain

/**
 * Lifecycle états d'un job d'analyse asynchrone (`ticker_narrative_job` côté Phase 1, et
 * historiquement `analysis_job` côté Phase 0 jusqu'à la migration V6).
 *
 * - `PENDING` : créé, runner kické, en attente de la réponse LLM. `OrphanedJobCleanupListener`
 *   flippe cet état en `ERROR` au boot suivant si le runner n'a pas pu finir (crash JVM, hot-reload
 *   Tilt, etc.).
 * - `DONE` : LLM a répondu, parser/validator OK, snapshot persisté.
 * - `ERROR` : LLM a échoué, ou parser/validator a refusé après les retries, ou cleanup boot.
 */
enum class JobStatus {
  PENDING,
  DONE,
  ERROR,
}
