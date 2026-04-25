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
    val marketCurrency: String
)

data class AccountImportPreview(
    val accountName: String,
    val items: List<CsvImportPreviewItem>
)

data class CsvImportPreview(
    val accounts: List<AccountImportPreview>,
    val totalItems: Int,
    val skippedRows: Int,
    val warnings: List<String>
)

data class CsvImportResult(
    val portfoliosCreated: Int,
    val portfoliosUpdated: Int,
    val totalImported: Int,
    val skipped: Int
)
