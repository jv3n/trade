package com.portfolioai.lexicon.application.dto

/**
 * Create / update payload for a lexicon entry. All three fields are required ; the service trims
 * them and rejects blanks (400) plus case-insensitive duplicate terms (409).
 */
data class LexiconEntryRequest(val term: String, val definitionFr: String, val definitionEn: String)
