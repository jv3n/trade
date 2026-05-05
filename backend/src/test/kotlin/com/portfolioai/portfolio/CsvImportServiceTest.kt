package com.portfolioai.portfolio

import com.portfolioai.portfolio.application.CsvImportService
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
import java.nio.charset.Charset
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.argThat
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.mock.web.MockMultipartFile

/**
 * Tests on [CsvImportService] — the parser for Wealthsimple `holdings-report-*.csv` exports. The
 * service is the **only way data enters the system** (the portfolio is read-only in the UI per
 * CLAUDE.md), so a regression here means imports silently misread positions and the rest of the app
 * draws conclusions on bad data.
 *
 * Three areas are pinned down :
 * - **Preview parsing** — the headers, footer rows, BOM bytes, semicolon delimiter, account
 *   grouping, asset-type mapping, duplicate-ticker aggregation. Each test mirrors a real shape we
 *   have seen across exports (FR locale, Excel-saved CSV with semicolons, etc.).
 * - **Asset type mapping** — Wealthsimple's labels (`EXCHANGE_TRADED_FUND`, `CRYPTOCURRENCY`,
 *   `BOND`, `FIXED_INCOME`…) translated to our [com.portfolioai.portfolio.domain.AssetType] enum.
 * - **`extractDateFromFilename`** — date in filename ↔ snapshot's `importedAt`. Anchored at noon
 *   UTC because midnight UTC regressed the displayed civil date by one day for users west of UTC
 *   (real bug reported on `holdings-report-2026-05-02.csv` showing as 2026-05-01 in ET).
 *
 * Repos are mocked with Mockito because the service does heavy IO ; full integration coverage lives
 * in CI's PostgreSQL-backed runs of the live import flow.
 */
@ExtendWith(MockitoExtension::class)
class CsvImportServiceTest {

  @Mock private lateinit var portfolioRepository: PortfolioRepository
  @Mock private lateinit var assetRepository: AssetRepository
  @Mock private lateinit var snapshotRepository: PortfolioSnapshotRepository
  @Mock private lateinit var snapshotPositionRepository: SnapshotPositionRepository

  private lateinit var service: CsvImportService

  @BeforeEach
  fun setUp() {
    service =
      CsvImportService(
        portfolioRepository,
        assetRepository,
        snapshotRepository,
        snapshotPositionRepository,
      )
  }

  // ---- helpers ----

  private val header =
    "Nom du compte,Type de compte,Classification du compte,Numéro de compte," +
      "Symbole,Bourse,MIC,Nom,Type,Quantité,Direction de position," +
      "Prix du marché,Devise du prix,Valeur comptable (CAD),Devise de la valeur comptable (CAD)," +
      "Valeur comptable (Marché),Devise de la valeur comptable (Marché)," +
      "Valeur marchande,Devise de la valeur marchande," +
      "Rendements non réalisés du marché,Devise des rendements non réalisés du marché"

  private fun row(
    account: String = "CELI",
    ticker: String = "AAPL",
    name: String = "Apple Inc.",
    type: String = "EQUITY",
    qty: String = "10",
    direction: String = "long",
    bookValueCad: String = "1500.00",
    bookValueMarket: String = "1350.00",
    marketValue: String = "1800.00",
    gain: String = "450.00",
    gainCurrency: String = "USD",
  ) =
    "$account,TFSA,,XXXX,$ticker,NASDAQ,,$name,$type,$qty,$direction,180.00,USD,$bookValueCad,CAD,$bookValueMarket,USD,$marketValue,USD,$gain,$gainCurrency"

  private fun makeCsv(vararg rows: String, charset: Charset = Charsets.UTF_8): MockMultipartFile {
    val content = (listOf(header) + rows.toList()).joinToString("\n")
    return MockMultipartFile("file", "test.csv", "text/csv", content.toByteArray(charset))
  }

  private fun makeCsvWithDelimiter(delimiter: Char, vararg rows: String): MockMultipartFile {
    val h = header.replace(',', delimiter)
    val content = (listOf(h) + rows.map { it.replace(',', delimiter) }).joinToString("\n")
    return MockMultipartFile("file", "test.csv", "text/csv", content.toByteArray(Charsets.UTF_8))
  }

  // ---- preview: parsing ----

  @Test
  fun `preview returns one account with one item`() {
    val file = makeCsv(row())
    val preview = service.preview(file)

    assertEquals(1, preview.accounts.size)
    assertEquals("CELI", preview.accounts[0].accountName)
    assertEquals(1, preview.accounts[0].items.size)
    assertEquals("AAPL", preview.accounts[0].items[0].ticker)
    assertEquals(1, preview.totalItems)
    assertTrue(preview.warnings.isEmpty())
  }

  @Test
  fun `preview groups rows by account`() {
    val file =
      makeCsv(
        row(account = "CELI", ticker = "AAPL"),
        row(account = "CELI", ticker = "GOOG", name = "Alphabet"),
        row(account = "REER", ticker = "BTC", type = "CRYPTOCURRENCY"),
      )
    val preview = service.preview(file)

    assertEquals(2, preview.accounts.size)
    val celi = preview.accounts.first { it.accountName == "CELI" }
    val reer = preview.accounts.first { it.accountName == "REER" }
    assertEquals(2, celi.items.size)
    assertEquals(1, reer.items.size)
    assertEquals(3, preview.totalItems)
  }

  @Test
  fun `preview skips footer row with fewer than 10 columns`() {
    val footer = "À partir de 2025-01-01"
    val file = makeCsv(row(), footer)
    val preview = service.preview(file)

    assertEquals(1, preview.totalItems)
    assertEquals(1, preview.skippedRows)
  }

  @Test
  fun `preview skips short positions row`() {
    val file = makeCsv(row(), "CELI,too,short")
    val preview = service.preview(file)

    assertEquals(1, preview.totalItems)
    assertEquals(1, preview.skippedRows)
  }

  @Test
  fun `preview skips non-long direction`() {
    val file = makeCsv(row(direction = "long"), row(ticker = "SHRT", direction = "short"))
    val preview = service.preview(file)

    assertEquals(1, preview.totalItems)
    assertEquals(1, preview.skippedRows)
  }

  @Test
  fun `preview handles BOM UTF-8`() {
    val content = (listOf(header) + listOf(row())).joinToString("\n")
    val bom = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte())
    val bytes = bom + content.toByteArray(Charsets.UTF_8)
    val file = MockMultipartFile("file", "test.csv", "text/csv", bytes)

    val preview = service.preview(file)
    assertEquals(1, preview.totalItems)
  }

  @Test
  fun `preview detects semicolon delimiter`() {
    val file = makeCsvWithDelimiter(';', row())
    val preview = service.preview(file)

    assertEquals(1, preview.totalItems)
    assertEquals("AAPL", preview.accounts[0].items[0].ticker)
  }

  @Test
  fun `preview warns when no valid rows found`() {
    val file = makeCsv("not,a,valid,row")
    val preview = service.preview(file)

    assertEquals(0, preview.totalItems)
    assertFalse(preview.warnings.isEmpty())
  }

  // ---- asset type mapping ----

  @Test
  fun `maps ETF type`() {
    val file = makeCsv(row(type = "EXCHANGE_TRADED_FUND"))
    val preview = service.preview(file)
    assertEquals("ETF", preview.accounts[0].items[0].assetType)
  }

  @Test
  fun `maps CRYPTO type`() {
    val file = makeCsv(row(type = "CRYPTOCURRENCY"))
    val preview = service.preview(file)
    assertEquals("CRYPTO", preview.accounts[0].items[0].assetType)
  }

  @Test
  fun `maps BOND type`() {
    val file = makeCsv(row(type = "BOND"))
    val preview = service.preview(file)
    assertEquals("BOND", preview.accounts[0].items[0].assetType)
  }

  @Test
  fun `maps unknown type to STOCK`() {
    val file = makeCsv(row(type = "EQUITY"))
    val preview = service.preview(file)
    assertEquals("STOCK", preview.accounts[0].items[0].assetType)
  }

  // ---- values ----

  @Test
  fun `preview parses bookValueCad and marketValue`() {
    val file = makeCsv(row(bookValueCad = "2000.50", marketValue = "2200.75"))
    val item = service.preview(file).accounts[0].items[0]

    assertEquals(0, item.bookValueCad.compareTo(java.math.BigDecimal("2000.50")))
    assertEquals(0, item.marketValue.compareTo(java.math.BigDecimal("2200.75")))
  }

  @Test
  fun `preview aggregates duplicate ticker across rows`() {
    val file =
      makeCsv(
        row(qty = "5", bookValueCad = "500.00", marketValue = "600.00"),
        row(qty = "3", bookValueCad = "300.00", marketValue = "360.00"),
      )
    val preview = service.preview(file)

    assertEquals(1, preview.accounts[0].items.size)
    val item = preview.accounts[0].items[0]
    assertEquals(0, item.quantity.compareTo(java.math.BigDecimal("8")))
  }

  // ---- date extraction from filename ----

  /*
   * The snapshot's `importedAt` is taken from the CSV filename when it embeds an ISO date
   * (Wealthsimple-style `holdings-report-YYYY-MM-DD.csv`). The function intentionally returns an
   * [Instant] anchored at **noon UTC** of that civil date — anchoring at midnight UTC would
   * regress the displayed date by one day for every user west of UTC (the user reported this on
   * a file dated 2026-05-02 showing as 2026-05-01 from ET).
   */

  @Test
  fun `extractDateFromFilename pins the date to noon UTC so every reasonable timezone keeps the same civil day`() {
    val instant = service.extractDateFromFilename("holdings-report-2026-05-02.csv")

    val utc = instant.atZone(java.time.ZoneOffset.UTC)
    assertEquals(java.time.LocalDate.of(2026, 5, 2), utc.toLocalDate())
    assertEquals(12, utc.hour)

    // Spot-check across the realistic range — every populated zone (UTC-11 .. UTC+12) keeps the
    // same civil date when the source instant is noon UTC.
    listOf(
        java.time.ZoneOffset.ofHours(-8), // PST
        java.time.ZoneOffset.ofHours(-4), // ET (the user's zone)
        java.time.ZoneOffset.ofHours(0), // UTC
        java.time.ZoneOffset.ofHours(2), // CET
        java.time.ZoneOffset.ofHours(9), // JST
      )
      .forEach { zone ->
        val zoned = instant.atZone(zone)
        assertEquals(
          java.time.LocalDate.of(2026, 5, 2),
          zoned.toLocalDate(),
          "civil date drifted in $zone",
        )
      }
  }

  @Test
  fun `extractDateFromFilename matches the date even when surrounded by extra text`() {
    // We've seen filenames like `Wealthsimple_holdings-report-2026-05-02_v2.csv` from manual
    // re-exports — the regex picks the first ISO date it finds.
    val instant = service.extractDateFromFilename("Wealthsimple_holdings-report-2026-05-02_v2.csv")
    assertEquals(
      java.time.LocalDate.of(2026, 5, 2),
      instant.atZone(java.time.ZoneOffset.UTC).toLocalDate(),
    )
  }

  @Test
  fun `extractDateFromFilename falls back to now when filename is null`() {
    // Some MultipartFile sources hand us `originalFilename = null` (programmatic uploads, tests).
    // Falling back to "import is for today" is the least surprising default.
    val before = java.time.Instant.now()
    val instant = service.extractDateFromFilename(null)
    val after = java.time.Instant.now()

    assertTrue(!instant.isBefore(before) && !instant.isAfter(after))
  }

  @Test
  fun `extractDateFromFilename falls back to now when no ISO date is present`() {
    val before = java.time.Instant.now()
    val instant = service.extractDateFromFilename("export-final.csv")
    val after = java.time.Instant.now()

    assertTrue(!instant.isBefore(before) && !instant.isAfter(after))
  }

  @Test
  fun `extractDateFromFilename falls back to now when the date string is invalid`() {
    // Regex matches digits-only structure, but `2026-13-40` parses-fail at LocalDate level.
    val before = java.time.Instant.now()
    val instant = service.extractDateFromFilename("holdings-report-2026-13-40.csv")
    val after = java.time.Instant.now()

    assertTrue(!instant.isBefore(before) && !instant.isAfter(after))
  }

  // ---- import: position lifecycle (V5) ----

  /**
   * Helpers pour tester `import()` avec des repos mockés. Les tests de lifecycle pinnent le
   * comportement OPEN ↔ CLOSED face à un CSV qui ajoute / enlève / réintroduit un ticker. La source
   * du bug observé : un ticker (XAU) restait sur le dashboard même après vente parce que l'upsert
   * ne supprimait pas les rows absentes du nouvel import. V5 introduit le status — ces tests
   * garantissent que le flip se fait au bon moment et qu'une réouverture remet bien `closed_at` à
   * null.
   */
  private fun openAsset(
    portfolio: Portfolio,
    ticker: String,
    name: String = "$ticker Inc.",
    status: AssetStatus = AssetStatus.OPEN,
  ): Asset =
    Asset(
      portfolio = portfolio,
      ticker = ticker,
      name = name,
      quantity = BigDecimal("10"),
      avgBuyPrice = BigDecimal("100.00"),
      assetType = AssetType.STOCK,
      currency = "USD",
      bookValueCad = BigDecimal("1000.00"),
      marketValue = BigDecimal("1100.00"),
      status = status,
    )

  private fun stubImportRepos(portfolio: Portfolio, existingAssets: List<Asset>) {
    whenever(portfolioRepository.findByName(portfolio.name)).thenReturn(portfolio)
    whenever(assetRepository.findByPortfolioId(portfolio.id)).thenReturn(existingAssets)
    whenever(assetRepository.save(any<Asset>())).thenAnswer { it.arguments[0] as Asset }
    whenever(snapshotRepository.save(any<PortfolioSnapshot>())).thenAnswer {
      it.arguments[0] as PortfolioSnapshot
    }
    whenever(snapshotPositionRepository.save(any<SnapshotPosition>())).thenAnswer {
      it.arguments[0] as SnapshotPosition
    }
    whenever(portfolioRepository.save(any<Portfolio>())).thenAnswer { it.arguments[0] as Portfolio }
  }

  @Test
  fun `import flips a ticker absent from the new CSV to CLOSED with closedAt set`() {
    // Le scénario "j'ai vendu XAU, mon nouvel export Wealthsimple ne le contient plus". Avant V5
    // la ligne `asset` restait OPEN à jamais et XAU continuait d'apparaître au dashboard.
    val portfolio = Portfolio(name = "CELI")
    val xau = openAsset(portfolio, "XAU", "Gold ETF")
    val aapl = openAsset(portfolio, "AAPL")
    stubImportRepos(portfolio, listOf(xau, aapl))

    // Nouveau CSV : seulement AAPL, pas XAU.
    val file = makeCsv(row(account = "CELI", ticker = "AAPL", name = "Apple Inc."))
    val result = service.import(file)

    assertEquals(1, result.positionsClosed)
    assertEquals(0, result.positionsReopened)
    // XAU est passé en CLOSED, closedAt non-null. AAPL reste OPEN.
    verify(assetRepository)
      .save(argThat<Asset> { ticker == "XAU" && status == AssetStatus.CLOSED && closedAt != null })
  }

  @Test
  fun `import reopens a previously CLOSED ticker that comes back in the new CSV`() {
    // Le scénario "j'avais vendu NVDA, je rachète maintenant". V5 doit le réouvrir : status
    // → OPEN, closedAt → null. Le opened_at d'origine est conservé (premier import historique
    // du ticker dans ce portfolio) — décision de design pour ne pas perdre la date d'entrée
    // initiale en BDD.
    val portfolio = Portfolio(name = "REER")
    val closedNvda =
      openAsset(portfolio, "NVDA", "NVIDIA Corp.", status = AssetStatus.CLOSED).also {
        it.closedAt = java.time.Instant.parse("2026-04-01T12:00:00Z")
      }
    stubImportRepos(portfolio, listOf(closedNvda))

    val file = makeCsv(row(account = "REER", ticker = "NVDA", name = "NVIDIA Corp."))
    val result = service.import(file)

    assertEquals(0, result.positionsClosed)
    assertEquals(1, result.positionsReopened)
    verify(assetRepository)
      .save(argThat<Asset> { ticker == "NVDA" && status == AssetStatus.OPEN && closedAt == null })
  }

  @Test
  fun `import is a no-op on lifecycle when the CSV matches the current portfolio exactly`() {
    // Garde-fou : ré-importer un export identique ne doit rien fermer ni réouvrir. Sinon on
    // pollue la BDD à chaque save Tilt qui re-déclenche l'import démo.
    val portfolio = Portfolio(name = "CELI")
    val aapl = openAsset(portfolio, "AAPL", "Apple Inc.")
    stubImportRepos(portfolio, listOf(aapl))

    val file = makeCsv(row(account = "CELI", ticker = "AAPL", name = "Apple Inc."))
    val result = service.import(file)

    assertEquals(0, result.positionsClosed)
    assertEquals(0, result.positionsReopened)
    // Aucun save ne doit avoir flippé un status — on vérifie qu'on n'a jamais saved un asset
    // avec closedAt != null (on aurait quand même un save pour update les valeurs du AAPL,
    // mais avec status=OPEN et closedAt=null inchangés).
    verify(assetRepository, never())
      .save(argThat<Asset> { closedAt != null || status == AssetStatus.CLOSED })
  }
}
