package com.portfolioai.portfolio.application

import com.portfolioai.auth.application.AuthService
import com.portfolioai.portfolio.application.dto.AccountImportPreview
import com.portfolioai.portfolio.application.dto.CsvImportPreview
import com.portfolioai.portfolio.application.dto.CsvImportPreviewItem
import com.portfolioai.portfolio.application.dto.CsvImportResult
import com.portfolioai.portfolio.domain.Asset
import com.portfolioai.portfolio.domain.AssetStatus
import com.portfolioai.portfolio.domain.AssetType
import com.portfolioai.portfolio.domain.Portfolio
import com.portfolioai.portfolio.domain.PortfolioSnapshot
import com.portfolioai.portfolio.domain.SnapshotPosition
import com.portfolioai.portfolio.infrastructure.persistence.AssetRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioSnapshotRepository
import com.portfolioai.portfolio.infrastructure.persistence.SnapshotPositionRepository
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVParser
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.multipart.MultipartFile

/**
 * Parsed row from Wealthsimple holdings CSV (positions snapshot, not transaction history).
 *
 * WS export columns (French, 21 cols): Nom du compte, Type de compte, Classification du compte,
 * Numéro de compte, Symbole, Bourse, MIC, Nom, Type, Quantité, Direction de position, Prix du
 * marché, Devise du prix, Valeur comptable (CAD), Devise de la valeur comptable (CAD), Valeur
 * comptable (Marché), Devise de la valeur comptable (Marché), Valeur marchande, Devise de la valeur
 * marchande, Rendements non réalisés du marché, Devise des rendements non réalisés du marché
 */
private data class WsHoldingRow(
  val accountName: String,
  val ticker: String,
  val name: String,
  val wsType: String,
  val quantity: BigDecimal,
  val bookValueMarket: BigDecimal,
  val bookValueCad: BigDecimal,
  val marketValue: BigDecimal,
  val marketCurrency: String,
  val unrealizedGain: BigDecimal?,
  val gainCurrency: String?,
  val currency: String,
  val isLong: Boolean,
)

@Service
@Transactional(readOnly = true)
class CsvImportService(
  private val portfolioRepository: PortfolioRepository,
  private val assetRepository: AssetRepository,
  private val snapshotRepository: PortfolioSnapshotRepository,
  private val snapshotPositionRepository: SnapshotPositionRepository,
  private val authService: AuthService,
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
    val importedAt = extractDateFromFilename(file.originalFilename)
    // Capture le user **une fois** au début du flow — pas de risque de drift si la session
    // expirait mid-import (le import est `@Transactional`, donc soit tout passe avec ce user,
    // soit rollback complet).
    val currentUser = authService.getCurrentUser()
    var portfoliosCreated = 0
    var portfoliosUpdated = 0
    var totalImported = 0
    var positionsClosed = 0
    var positionsReopened = 0

    for ((accountName, rows) in rowsByAccount) {
      val existingPortfolio = portfolioRepository.findByUserIdAndName(currentUser.id, accountName)
      val portfolio =
        existingPortfolio
          ?: portfolioRepository.save(Portfolio(user = currentUser, name = accountName)).also {
            portfoliosCreated++
          }
      if (existingPortfolio != null) portfoliosUpdated++

      // Charge tous les assets (OPEN + CLOSED) — il faut voir les CLOSED pour pouvoir réouvrir
      // un ticker qui revient (ex: rachat après vente). Le lifecycle est dans V5 ; les rows
      // pré-V5 sont toutes OPEN par backfill.
      val existing = assetRepository.findByPortfolioId(portfolio.id).associateBy { it.ticker }
      val tickersInCsv = rows.map { it.ticker }.toSet()

      for (row in rows) {
        val avgPrice = row.avgBuyPrice()
        val assetType = mapAssetType(row.wsType)
        val asset = existing[row.ticker]
        if (asset != null) {
          val wasReopened = asset.status == AssetStatus.CLOSED
          asset.quantity = row.quantity
          asset.avgBuyPrice = avgPrice
          asset.name = row.name
          asset.assetType = assetType
          asset.currency = row.marketCurrency
          asset.bookValueCad = row.bookValueCad
          asset.marketValue = row.marketValue
          asset.unrealizedGain = row.unrealizedGain
          asset.gainCurrency = row.gainCurrency
          asset.updatedAt = importedAt
          if (wasReopened) {
            // Position qui revient : on flip OPEN, on clear closed_at, on garde le opened_at
            // d'origine (premier import historique du ticker dans ce portfolio).
            asset.status = AssetStatus.OPEN
            asset.closedAt = null
            positionsReopened++
          }
          assetRepository.save(asset)
        } else {
          assetRepository.save(
            Asset(
              portfolio = portfolio,
              ticker = row.ticker,
              name = row.name,
              quantity = row.quantity,
              avgBuyPrice = avgPrice,
              assetType = assetType,
              currency = row.marketCurrency,
              bookValueCad = row.bookValueCad,
              marketValue = row.marketValue,
              unrealizedGain = row.unrealizedGain,
              gainCurrency = row.gainCurrency,
              status = AssetStatus.OPEN,
              openedAt = importedAt,
            )
          )
        }
        totalImported++
      }

      // Détection des positions soldées : assets OPEN qui ne sont plus dans le CSV de cet
      // account → flip CLOSED + closed_at. On fige les valeurs telles quelles (dernière snapshot
      // connue) — la future page "Positions historiques" lira ces rows.
      val toClose =
        existing.values.filter { it.status == AssetStatus.OPEN && it.ticker !in tickersInCsv }
      for (asset in toClose) {
        asset.status = AssetStatus.CLOSED
        asset.closedAt = importedAt
        asset.updatedAt = importedAt
        assetRepository.save(asset)
        positionsClosed++
      }

      val snapshot =
        snapshotRepository.save(
          PortfolioSnapshot(batchId = batchId, portfolio = portfolio, importedAt = importedAt)
        )
      for (row in rows) {
        snapshotPositionRepository.save(
          SnapshotPosition(
            snapshot = snapshot,
            ticker = row.ticker,
            name = row.name,
            assetType = mapAssetType(row.wsType),
            quantity = row.quantity,
            bookValueCad = row.bookValueCad,
            marketValue = row.marketValue,
            marketCurrency = row.marketCurrency,
            unrealizedGain = row.unrealizedGain,
            gainCurrency = row.gainCurrency,
          )
        )
      }

      portfolio.updatedAt = importedAt
      portfolioRepository.save(portfolio)
    }

    // userId logged for multi-tenant audit trail (Phase 4) — never log the user's email, the UUID
    // is enough to correlate with the `app_user` table via SQL.
    log.info(
      "CSV import batch={} userId={}: {} portfolios created, {} updated, {} positions, {} closed, {} reopened, {} rows skipped",
      batchId,
      currentUser.id,
      portfoliosCreated,
      portfoliosUpdated,
      totalImported,
      positionsClosed,
      positionsReopened,
      skipped,
    )
    return CsvImportResult(
      portfoliosCreated = portfoliosCreated,
      portfoliosUpdated = portfoliosUpdated,
      totalImported = totalImported,
      skipped = skipped,
      positionsClosed = positionsClosed,
      positionsReopened = positionsReopened,
    )
  }

  // ---- parsing ----

  private data class ParseResult(
    val rowsByAccount: Map<String, List<WsHoldingRow>>,
    val skippedRows: Int,
    val warnings: List<String>,
  )

  private fun parseCsv(file: MultipartFile): ParseResult {
    val warnings = mutableListOf<String>()
    var skipped = 0

    val rawBytes = file.bytes
    val contentBytes =
      if (
        rawBytes.size >= 3 &&
          rawBytes[0] == 0xEF.toByte() &&
          rawBytes[1] == 0xBB.toByte() &&
          rawBytes[2] == 0xBF.toByte()
      )
        rawBytes.drop(3).toByteArray()
      else rawBytes
    val rawText = String(contentBytes, Charsets.UTF_8)

    val firstLine = rawText.lineSequence().first()
    val delimiter =
      when {
        firstLine.count { it == '\t' } >= 3 -> '\t'
        firstLine.count { it == ';' } >= 3 -> ';'
        else -> ','
      }
    log.info("WS CSV delimiter='{}' size={}b", delimiter, rawBytes.size)

    val format =
      CSVFormat.DEFAULT.builder()
        .setDelimiter(delimiter)
        .setHeader()
        .setSkipHeaderRecord(true)
        .setIgnoreHeaderCase(true)
        .setTrim(true)
        .setIgnoreEmptyLines(true)
        // commons-csv 1.14 deprecated `Builder.build()` in favour of `Builder.get()`
        // (alignment with the rest of the commons-* family). Same behaviour.
        .get()

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
      var totalUnrealizedGain: BigDecimal = BigDecimal.ZERO,
    )
    val byAccountTicker = mutableMapOf<AccountTicker, Accumulator>()

    for (record in parser) {
      if (record.size() < 10) {
        skipped++
        continue
      }

      val cols =
        try {
          record.toMap().entries.associate { (k, v) -> normalise(k) to v }
        } catch (ignored: Exception) {
          // Mismatched header / row width — skip silently and continue. The user sees the count
          // of skipped rows in the import preview ; per-row diagnostics would be too noisy on a
          // CSV that legitimately mixes account types.
          skipped++
          continue
        }

      val row = parseHoldingRow(cols)
      if (row == null || !row.isLong) {
        skipped++
        continue
      }

      val key = AccountTicker(row.accountName, row.ticker)
      val acc =
        byAccountTicker.getOrPut(key) {
          Accumulator(row.name, row.wsType, row.currency, row.marketCurrency, row.gainCurrency)
        }
      acc.totalQty += row.quantity
      acc.totalBookValueMarket += row.bookValueMarket
      acc.totalBookValueCad += row.bookValueCad
      acc.totalMarketValue += row.marketValue
      acc.totalUnrealizedGain += row.unrealizedGain ?: BigDecimal.ZERO
    }

    val rowsByAccount =
      byAccountTicker.entries.groupBy({ it.key.account }) { (key, acc) ->
        WsHoldingRow(
          accountName = key.account,
          ticker = key.ticker,
          name = acc.name,
          wsType = acc.wsType,
          quantity = acc.totalQty,
          bookValueMarket = acc.totalBookValueMarket,
          bookValueCad = acc.totalBookValueCad,
          marketValue = acc.totalMarketValue,
          marketCurrency = acc.marketCurrency,
          unrealizedGain = if (acc.gainCurrency != null) acc.totalUnrealizedGain else null,
          gainCurrency = acc.gainCurrency,
          currency = acc.currency,
          isLong = true,
        )
      }

    if (rowsByAccount.isEmpty()) {
      warnings.add(
        "Aucune position lue. Délimiteur détecté : '$delimiter'. " +
          "Vérifiez que le fichier est bien l'export « Positions » de Wealthsimple."
      )
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

    val accountName = (cols["nom du compte"] ?: cols["account name"] ?: "Default").trim()
    val name = (cols["nom"] ?: cols["name"] ?: ticker).trim()
    val wsType = (cols["type"] ?: "").trim()
    val direction = (cols["direction de position"] ?: cols["position direction"] ?: "long").trim()
    val isLong = direction.equals("long", ignoreCase = true)

    val qtyStr = cols["quantite"] ?: cols["quantity"] ?: return null
    val qty = qtyStr.replace(",", ".").toBigDecimalOrNull() ?: return null
    if (qty <= BigDecimal.ZERO) return null

    fun decimal(key: String, fallback: String = "0"): BigDecimal =
      (cols[key] ?: fallback).replace(",", ".").toBigDecimalOrNull() ?: BigDecimal.ZERO

    val bookValueMarket = decimal("valeur comptable (marche)")
    val bookValueCad = decimal("valeur comptable (cad)")
    val marketValue = decimal("valeur marchande")
    val unrealizedGain =
      (cols["rendements non realises du marche"] ?: "").replace(",", ".").toBigDecimalOrNull()

    val currency =
      (cols["devise de la valeur comptable (marche)"] ?: cols["devise du prix"] ?: "USD").trim()
    val marketCurrency =
      (cols["devise de la valeur marchande"] ?: cols["devise du prix"] ?: "USD").trim()
    val gainCurrency = cols["devise des rendements non realises du marche"]?.trim()

    return WsHoldingRow(
      accountName = accountName,
      ticker = ticker.uppercase(),
      name = name,
      wsType = wsType,
      quantity = qty,
      bookValueMarket = bookValueMarket,
      bookValueCad = bookValueCad,
      marketValue = marketValue,
      marketCurrency = marketCurrency,
      unrealizedGain = unrealizedGain,
      gainCurrency = gainCurrency,
      currency = currency,
      isLong = isLong,
    )
  }

  private fun WsHoldingRow.avgBuyPrice(): BigDecimal {
    if (quantity.signum() == 0 || bookValueMarket.signum() == 0) return BigDecimal.ZERO
    return bookValueMarket.divide(quantity, 4, RoundingMode.HALF_UP).abs()
  }

  private fun WsHoldingRow.toPreviewItem() =
    CsvImportPreviewItem(
      ticker = ticker,
      name = name,
      quantity = quantity.setScale(6, RoundingMode.HALF_UP),
      avgBuyPrice = avgBuyPrice().setScale(4, RoundingMode.HALF_UP),
      assetType = mapAssetType(wsType).name,
      bookValueCad = bookValueCad.abs().setScale(2, RoundingMode.HALF_UP),
      marketValue = marketValue.abs().setScale(2, RoundingMode.HALF_UP),
      marketCurrency = marketCurrency,
    )

  /**
   * Best-effort extraction of the snapshot date from a Wealthsimple-style filename
   * (`holdings-report-YYYY-MM-DD.csv`). Returns [Instant.now] when no date is present or the format
   * is invalid — caller treats that as "import is for today".
   *
   * Why **noon UTC** and not midnight : the snapshot represents a *civil date*, not a moment in
   * time. Midnight UTC of `2026-05-02` becomes `2026-05-01 20:00` for a user in ET (UTC-4) and the
   * UI displays the wrong day. Anchoring at 12:00 UTC keeps the same civil date for every zone
   * between UTC-11 and UTC+11, which covers every populated longitude.
   */
  internal fun extractDateFromFilename(filename: String?): Instant {
    if (filename == null) return Instant.now()
    val match = Regex("""(\d{4}-\d{2}-\d{2})""").find(filename) ?: return Instant.now()
    return try {
      LocalDate.parse(match.groupValues[1]).atTime(12, 0).toInstant(ZoneOffset.UTC)
    } catch (ignored: Exception) {
      // Regex matched a `\d{4}-\d{2}-\d{2}` shape but `LocalDate.parse` rejected it (e.g.
      // 2024-13-45). Falling back to `now()` is the same behaviour as having no match at all —
      // worst case the snapshot timeline shows the import time instead of the real export date.
      Instant.now()
    }
  }

  private fun mapAssetType(wsType: String): AssetType =
    when (wsType.uppercase()) {
      "EXCHANGE_TRADED_FUND" -> AssetType.ETF
      "CRYPTOCURRENCY" -> AssetType.CRYPTO
      "BOND",
      "FIXED_INCOME" -> AssetType.BOND
      "COMMODITY" -> AssetType.COMMODITY
      else -> AssetType.STOCK
    }
}
