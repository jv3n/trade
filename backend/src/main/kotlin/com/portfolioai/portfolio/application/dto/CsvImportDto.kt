package com.portfolioai.portfolio.application.dto

import java.math.BigDecimal

data class CsvImportPreviewItem(
  val ticker: String,
  val name: String,
  val quantity: BigDecimal,
  val avgBuyPrice: BigDecimal,
  val assetType: String,
  val bookValueCad: BigDecimal,
  val marketValue: BigDecimal,
  val marketCurrency: String,
)

data class AccountImportPreview(val accountName: String, val items: List<CsvImportPreviewItem>)

data class CsvImportPreview(
  val accounts: List<AccountImportPreview>,
  val totalItems: Int,
  val skippedRows: Int,
  val warnings: List<String>,
)

data class CsvImportResult(
  val portfoliosCreated: Int,
  val portfoliosUpdated: Int,
  val totalImported: Int,
  val skipped: Int,
  /**
   * Positions that were `OPEN` before this import but are absent from the new CSV — flipped to
   * `CLOSED`. Surfaced to the UI confirmation banner so the user can spot at a glance whether the
   * import matches their broker reality (e.g. "j'ai vendu XAU et l'import a bien fermé 1
   * position").
   */
  val positionsClosed: Int = 0,
  /**
   * Positions that were `CLOSED` before this import and reappear in the new CSV — flipped back to
   * `OPEN`. Typically a re-buy of a previously sold ticker. Same UI rationale as `positionsClosed`.
   */
  val positionsReopened: Int = 0,
)
