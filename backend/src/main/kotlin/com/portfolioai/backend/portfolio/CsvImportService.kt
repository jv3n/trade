package com.portfolioai.backend.portfolio

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.time.Instant
import java.util.UUID

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

/**
 * Parsed row from Wealthsimple holdings CSV (positions snapshot, not transaction history).
 *
 * WS export columns (French, 21 cols):
 *   Nom du compte, Type de compte, Classification du compte, Numéro de compte,
 *   Symbole, Bourse, MIC, Nom, Type, Quantité, Direction de position,
 *   Prix du marché, Devise du prix,
 *   Valeur comptable (CAD), Devise de la valeur comptable (CAD),
 *   Valeur comptable (Marché), Devise de la valeur comptable (Marché),
 *   Valeur marchande, Devise de la valeur marchande,
 *   Rendements non réalisés du marché, Devise des rendements non réalisés du marché
 *
 * The last line is a footer "À partir de <date>" with a single column — skipped via size() < 10.
 */
private data class WsHoldingRow(
    val accountName: String,
    val ticker: String,
    val name: String,
    val wsType: String,
    val quantity: BigDecimal,
    val bookValueMarket: BigDecimal,  // Valeur comptable (Marché) — pour calcul prix moyen
    val bookValueCad: BigDecimal,     // Valeur comptable (CAD) — toujours en CAD
    val marketValue: BigDecimal,      // Valeur marchande — valeur courante
    val marketCurrency: String,       // Devise de la valeur marchande
    val unrealizedGain: BigDecimal?,  // Rendements non réalisés du marché
    val gainCurrency: String?,        // Devise des rendements non réalisés du marché
    val currency: String,             // Devise de la valeur comptable (Marché)
    val isLong: Boolean
)

@Service
@Transactional(readOnly = true)
class CsvImportService(
    private val portfolioRepository: PortfolioRepository,
    private val assetRepository: AssetRepository,
    private val snapshotRepository: PortfolioSnapshotRepository,
    private val snapshotPositionRepository: SnapshotPositionRepository
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun preview(file: MultipartFile): CsvImportPreview {
        val (rowsByAccount, skipped, warnings) = parseCsv(file)
        val accounts = rowsByAccount.map { (accountName, rows) ->
            AccountImportPreview(accountName, rows.map { it.toPreviewItem() })
        }
        return CsvImportPreview(accounts, accounts.sumOf { it.items.size }, skipped, warnings)
    }

    @Transactional
    fun import(file: MultipartFile): CsvImportResult {
        val (rowsByAccount, skipped, _) = parseCsv(file)
        val batchId = UUID.randomUUID()
        val importedAt = Instant.now()
        var portfoliosCreated = 0
        var portfoliosUpdated = 0
        var totalImported = 0

        for ((accountName, rows) in rowsByAccount) {
            val existingPortfolio = portfolioRepository.findByName(accountName)
            val portfolio = existingPortfolio
                ?: portfolioRepository.save(Portfolio(name = accountName)).also { portfoliosCreated++ }
            if (existingPortfolio != null) portfoliosUpdated++

            // Upsert current positions
            val existing = assetRepository.findByPortfolioId(portfolio.id).associateBy { it.ticker }
            for (row in rows) {
                val avgPrice = row.avgBuyPrice()
                val assetType = mapAssetType(row.wsType)
                val asset = existing[row.ticker]
                if (asset != null) {
                    asset.quantity = row.quantity
                    asset.avgBuyPrice = avgPrice
                    asset.name = row.name
                    asset.assetType = assetType
                    asset.currency = row.marketCurrency
                    asset.bookValueCad = row.bookValueCad
                    asset.updatedAt = importedAt
                    assetRepository.save(asset)
                } else {
                    assetRepository.save(Asset(
                        portfolio = portfolio,
                        ticker = row.ticker,
                        name = row.name,
                        quantity = row.quantity,
                        avgBuyPrice = avgPrice,
                        assetType = assetType,
                        currency = row.marketCurrency,
                        bookValueCad = row.bookValueCad
                    ))
                }
                totalImported++
            }

            // Create snapshot
            val snapshot = snapshotRepository.save(PortfolioSnapshot(
                batchId = batchId,
                portfolio = portfolio,
                importedAt = importedAt
            ))
            for (row in rows) {
                snapshotPositionRepository.save(SnapshotPosition(
                    snapshot = snapshot,
                    ticker = row.ticker,
                    name = row.name,
                    assetType = mapAssetType(row.wsType),
                    quantity = row.quantity,
                    bookValueCad = row.bookValueCad,
                    marketValue = row.marketValue,
                    marketCurrency = row.marketCurrency,
                    unrealizedGain = row.unrealizedGain,
                    gainCurrency = row.gainCurrency
                ))
            }

            portfolio.updatedAt = importedAt
            portfolioRepository.save(portfolio)
        }

        log.info("CSV import batch={}: {} portfolios created, {} updated, {} positions, {} rows skipped",
            batchId, portfoliosCreated, portfoliosUpdated, totalImported, skipped)
        return CsvImportResult(portfoliosCreated, portfoliosUpdated, totalImported, skipped)
    }

    // ---- parsing ----

    private data class ParseResult(
        val rowsByAccount: Map<String, List<WsHoldingRow>>,
        val skippedRows: Int,
        val warnings: List<String>
    )

    private fun parseCsv(file: MultipartFile): ParseResult {
        val warnings = mutableListOf<String>()
        var skipped = 0

        val rawBytes = file.bytes
        val contentBytes = if (rawBytes.size >= 3 &&
            rawBytes[0] == 0xEF.toByte() && rawBytes[1] == 0xBB.toByte() && rawBytes[2] == 0xBF.toByte())
            rawBytes.drop(3).toByteArray() else rawBytes
        val rawText = String(contentBytes, Charsets.UTF_8)

        val firstLine = rawText.lineSequence().first()
        val delimiter = when {
            firstLine.count { it == '\t' } >= 3 -> '\t'
            firstLine.count { it == ';'  } >= 3 -> ';'
            else                                 -> ','
        }
        log.info("WS CSV delimiter='{}' size={}b", delimiter, rawBytes.size)

        val format = CSVFormat.DEFAULT.builder()
            .setDelimiter(delimiter)
            .setHeader()
            .setSkipHeaderRecord(true)
            .setIgnoreHeaderCase(true)
            .setTrim(true)
            .setIgnoreEmptyLines(true)
            .build()

        val parser = CSVParser.parse(rawText.reader(), format)
        log.info("WS CSV headers (normalised): {}", parser.headerNames.map { normalise(it) })

        data class AccountTicker(val account: String, val ticker: String)
        data class Accumulator(
            var name: String,
            var wsType: String,
            var currency: String,
            var marketCurrency: String,
            var gainCurrency: String?,
            var totalQty: BigDecimal = BigDecimal.ZERO,
            var totalBookValueMarket: BigDecimal = BigDecimal.ZERO,
            var totalBookValueCad: BigDecimal = BigDecimal.ZERO,
            var totalMarketValue: BigDecimal = BigDecimal.ZERO,
            var totalUnrealizedGain: BigDecimal = BigDecimal.ZERO
        )
        val byAccountTicker = mutableMapOf<AccountTicker, Accumulator>()

        for (record in parser) {
            if (record.size() < 10) { skipped++; continue }

            val cols = try {
                record.toMap().entries.associate { (k, v) -> normalise(k) to v }
            } catch (e: Exception) { skipped++; continue }

            val row = parseHoldingRow(cols)
            if (row == null || !row.isLong) { skipped++; continue }

            val key = AccountTicker(row.accountName, row.ticker)
            val acc = byAccountTicker.getOrPut(key) {
                Accumulator(row.name, row.wsType, row.currency, row.marketCurrency, row.gainCurrency)
            }
            acc.totalQty             += row.quantity
            acc.totalBookValueMarket += row.bookValueMarket
            acc.totalBookValueCad    += row.bookValueCad
            acc.totalMarketValue     += row.marketValue
            acc.totalUnrealizedGain  += row.unrealizedGain ?: BigDecimal.ZERO
        }

        val rowsByAccount = byAccountTicker.entries.groupBy({ it.key.account }) { (key, acc) ->
            WsHoldingRow(
                accountName      = key.account,
                ticker           = key.ticker,
                name             = acc.name,
                wsType           = acc.wsType,
                quantity         = acc.totalQty,
                bookValueMarket  = acc.totalBookValueMarket,
                bookValueCad     = acc.totalBookValueCad,
                marketValue      = acc.totalMarketValue,
                marketCurrency   = acc.marketCurrency,
                unrealizedGain   = if (acc.gainCurrency != null) acc.totalUnrealizedGain else null,
                gainCurrency     = acc.gainCurrency,
                currency         = acc.currency,
                isLong           = true
            )
        }

        if (rowsByAccount.isEmpty()) {
            warnings.add("Aucune position lue. Délimiteur détecté : '$delimiter'. " +
                "Vérifiez que le fichier est bien l'export « Positions » de Wealthsimple.")
        }

        return ParseResult(rowsByAccount, skipped, warnings)
    }

    private fun normalise(s: String): String =
        Normalizer.normalize(s, Normalizer.Form.NFD)
            .replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
            .lowercase()
            .trim()

    private fun parseHoldingRow(cols: Map<String, String>): WsHoldingRow? {
        val ticker = (cols["symbole"] ?: cols["symbol"] ?: "").trim()
        if (ticker.isBlank()) return null

        val accountName  = (cols["nom du compte"] ?: cols["account name"] ?: "Default").trim()
        val name         = (cols["nom"] ?: cols["name"] ?: ticker).trim()
        val wsType       = (cols["type"] ?: "").trim()
        val direction    = (cols["direction de position"] ?: cols["position direction"] ?: "long").trim()
        val isLong       = direction.equals("long", ignoreCase = true)

        val qtyStr = cols["quantite"] ?: cols["quantity"] ?: return null
        val qty = qtyStr.replace(",", ".").toBigDecimalOrNull() ?: return null
        if (qty <= BigDecimal.ZERO) return null

        fun decimal(key: String, fallback: String = "0"): BigDecimal =
            (cols[key] ?: fallback).replace(",", ".").toBigDecimalOrNull() ?: BigDecimal.ZERO

        val bookValueMarket  = decimal("valeur comptable (marche)")
        val bookValueCad     = decimal("valeur comptable (cad)")
        val marketValue      = decimal("valeur marchande")
        val unrealizedGain   = (cols["rendements non realises du marche"] ?: "")
            .replace(",", ".").toBigDecimalOrNull()

        val currency         = (cols["devise de la valeur comptable (marche)"]
            ?: cols["devise du prix"] ?: "USD").trim()
        val marketCurrency   = (cols["devise de la valeur marchande"]
            ?: cols["devise du prix"] ?: "USD").trim()
        val gainCurrency     = cols["devise des rendements non realises du marche"]?.trim()

        return WsHoldingRow(
            accountName     = accountName,
            ticker          = ticker.uppercase(),
            name            = name,
            wsType          = wsType,
            quantity        = qty,
            bookValueMarket = bookValueMarket,
            bookValueCad    = bookValueCad,
            marketValue     = marketValue,
            marketCurrency  = marketCurrency,
            unrealizedGain  = unrealizedGain,
            gainCurrency    = gainCurrency,
            currency        = currency,
            isLong          = isLong
        )
    }

    private fun WsHoldingRow.avgBuyPrice(): BigDecimal {
        if (quantity.signum() == 0 || bookValueMarket.signum() == 0) return BigDecimal.ZERO
        return bookValueMarket.divide(quantity, 4, RoundingMode.HALF_UP).abs()
    }

    private fun WsHoldingRow.toPreviewItem() = CsvImportPreviewItem(
        ticker          = ticker,
        name            = name,
        quantity        = quantity.setScale(6, RoundingMode.HALF_UP),
        avgBuyPrice     = avgBuyPrice().setScale(4, RoundingMode.HALF_UP),
        assetType       = mapAssetType(wsType).name,
        bookValueCad    = bookValueCad.abs().setScale(2, RoundingMode.HALF_UP),
        marketValue     = marketValue.abs().setScale(2, RoundingMode.HALF_UP),
        marketCurrency  = marketCurrency
    )

    private fun mapAssetType(wsType: String): AssetType = when (wsType.uppercase()) {
        "EXCHANGE_TRADED_FUND" -> AssetType.ETF
        "CRYPTOCURRENCY"       -> AssetType.CRYPTO
        "BOND", "FIXED_INCOME" -> AssetType.BOND
        "COMMODITY"            -> AssetType.COMMODITY
        else                   -> AssetType.STOCK
    }
}
