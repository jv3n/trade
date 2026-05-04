package com.portfolioai.analysis.application

import com.portfolioai.ingestion.domain.FeedArticle
import com.portfolioai.portfolio.domain.AssetType
import com.portfolioai.portfolio.domain.Portfolio
import org.springframework.stereotype.Component

/**
 * Scores RSS articles by how likely they are to be relevant to a given portfolio. The signal is
 * keyword-based — tickers and asset names matter most, sector keywords next, then a baseline of
 * macro keywords. Cheap to compute and good enough until we move to embeddings.
 */
@Component
class ArticleRelevanceScorer {

  fun rank(
    articles: List<FeedArticle>,
    portfolio: Portfolio,
    limit: Int = DEFAULT_LIMIT,
  ): List<FeedArticle> {
    if (articles.isEmpty()) return emptyList()
    if (portfolio.assets.isEmpty()) return articles.take(limit)

    val tickers =
      portfolio.assets.map { it.ticker.lowercase() }.filter { it.length >= 2 }.distinct()
    val nameWords = portfolio.assets.flatMap { tokenizeName(it.name) }.distinct()
    val sectorKeywords =
      portfolio.assets.map { it.assetType }.toSet().flatMap { sectorKeywordsFor(it) }.distinct()

    val scored = articles.map { article ->
      val haystack = "${article.title} ${article.description ?: ""}".lowercase()
      article to scoreText(haystack, tickers, nameWords, sectorKeywords)
    }

    val relevant = scored.filter { it.second > 0 }.sortedByDescending { it.second }
    if (relevant.size >= MIN_RELEVANT) {
      return relevant.take(limit).map { it.first }
    }

    val included = relevant.map { it.first.id }.toSet()
    val topUp = articles.filter { it.id !in included }.take(limit - relevant.size)
    return (relevant.map { it.first } + topUp).take(limit)
  }

  private fun scoreText(
    haystack: String,
    tickers: List<String>,
    nameWords: List<String>,
    sectorKeywords: List<String>,
  ): Int {
    var score = 0
    for (t in tickers) {
      if (wordBoundary(t).containsMatchIn(haystack)) score += TICKER_WEIGHT
    }
    for (w in nameWords) {
      if (haystack.contains(w)) score += NAME_WEIGHT
    }
    for (k in sectorKeywords) {
      if (haystack.contains(k)) score += SECTOR_WEIGHT
    }
    for (m in MACRO_KEYWORDS) {
      if (haystack.contains(m)) score += MACRO_WEIGHT
    }
    return score
  }

  private fun wordBoundary(token: String): Regex =
    Regex("\\b${Regex.escape(token)}\\b", RegexOption.IGNORE_CASE)

  private fun tokenizeName(name: String): List<String> =
    name.lowercase().split(Regex("[^a-zà-öø-ÿ]+")).filter {
      it.length >= 4 && it !in NAME_STOPWORDS
    }

  private fun sectorKeywordsFor(type: AssetType): List<String> =
    when (type) {
      AssetType.CRYPTO -> listOf("crypto", "bitcoin", "ethereum", "blockchain", "btc", "eth")
      AssetType.BOND -> listOf("bond", "yield", "treasury")
      AssetType.COMMODITY -> listOf("commodity", "oil", "gold", "silver", "gas", "metal")
      AssetType.ETF -> listOf("etf", "index")
      AssetType.STOCK -> emptyList()
    }

  companion object {
    const val DEFAULT_LIMIT = 25
    private const val MIN_RELEVANT = 5
    private const val TICKER_WEIGHT = 10
    private const val NAME_WEIGHT = 5
    private const val SECTOR_WEIGHT = 2
    private const val MACRO_WEIGHT = 1

    private val MACRO_KEYWORDS =
      listOf(
        "fed",
        "fomc",
        "ecb",
        "boe",
        "boj",
        "powell",
        "lagarde",
        "rate",
        "rates",
        "inflation",
        "cpi",
        "ppi",
        "deflation",
        "gdp",
        "recession",
        "unemployment",
        "nonfarm",
        "treasury",
        "yield",
        "yields",
        "bond",
        "bonds",
      )

    private val NAME_STOPWORDS =
      setOf(
        "inc",
        "corp",
        "corporation",
        "company",
        "ltd",
        "llc",
        "plc",
        "group",
        "holdings",
        "the",
        "etf",
        "fund",
        "trust",
        "common",
        "stock",
        "shares",
        "class",
      )
  }
}
