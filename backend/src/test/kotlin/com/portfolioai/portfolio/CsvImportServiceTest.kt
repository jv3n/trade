package com.portfolioai.portfolio

import com.portfolioai.portfolio.application.CsvImportService
import com.portfolioai.portfolio.infrastructure.persistence.AssetRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioRepository
import com.portfolioai.portfolio.infrastructure.persistence.PortfolioSnapshotRepository
import com.portfolioai.portfolio.infrastructure.persistence.SnapshotPositionRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.springframework.mock.web.MockMultipartFile
import java.nio.charset.Charset

@ExtendWith(MockitoExtension::class)
class CsvImportServiceTest {

    @Mock private lateinit var portfolioRepository: PortfolioRepository
    @Mock private lateinit var assetRepository: AssetRepository
    @Mock private lateinit var snapshotRepository: PortfolioSnapshotRepository
    @Mock private lateinit var snapshotPositionRepository: SnapshotPositionRepository

    private lateinit var service: CsvImportService

    @BeforeEach
    fun setUp() {
        service = CsvImportService(portfolioRepository, assetRepository, snapshotRepository, snapshotPositionRepository)
    }

    // ---- helpers ----

    private val header = "Nom du compte,Type de compte,Classification du compte,Numéro de compte," +
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
        gainCurrency: String = "USD"
    ) = "$account,TFSA,,XXXX,$ticker,NASDAQ,,$name,$type,$qty,$direction,180.00,USD,$bookValueCad,CAD,$bookValueMarket,USD,$marketValue,USD,$gain,$gainCurrency"

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
        val file = makeCsv(
            row(account = "CELI", ticker = "AAPL"),
            row(account = "CELI", ticker = "GOOG", name = "Alphabet"),
            row(account = "REER", ticker = "BTC", type = "CRYPTOCURRENCY")
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
        val file = makeCsv(
            row(direction = "long"),
            row(ticker = "SHRT", direction = "short")
        )
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
        val file = makeCsv(
            row(qty = "5", bookValueCad = "500.00", marketValue = "600.00"),
            row(qty = "3", bookValueCad = "300.00", marketValue = "360.00")
        )
        val preview = service.preview(file)

        assertEquals(1, preview.accounts[0].items.size)
        val item = preview.accounts[0].items[0]
        assertEquals(0, item.quantity.compareTo(java.math.BigDecimal("8")))
    }
}
