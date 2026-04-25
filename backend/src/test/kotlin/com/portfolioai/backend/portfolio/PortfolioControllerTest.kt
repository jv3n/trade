package com.portfolioai.backend.portfolio

import com.portfolioai.backend.portfolio.dto.AssetDto
import com.portfolioai.backend.portfolio.dto.PortfolioDto
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.time.Instant
import java.util.UUID

@WebMvcTest(PortfolioController::class, GlobalExceptionHandler::class)
class PortfolioControllerTest {

    @Autowired private lateinit var mvc: MockMvc
    @MockitoBean private lateinit var portfolioService: PortfolioService

    private val id = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val now = Instant.parse("2025-01-01T00:00:00Z")

    private fun portfolioDto(name: String = "CELI") = PortfolioDto(
        id = id, name = name, description = null,
        createdAt = now, updatedAt = now, assetCount = 2
    )

    private fun assetDto() = AssetDto(
        id = UUID.randomUUID(), portfolioId = id,
        ticker = "AAPL", name = "Apple Inc.",
        quantity = java.math.BigDecimal("10"), avgBuyPrice = java.math.BigDecimal("150.00"),
        assetType = AssetType.STOCK, totalValue = java.math.BigDecimal("1800.00"),
        createdAt = now
    )

    @Test
    fun `GET portfolios returns 200 with list`() {
        given(portfolioService.findAll()).willReturn(listOf(portfolioDto()))

        mvc.perform(get("/api/portfolios").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].name").value("CELI"))
            .andExpect(jsonPath("$[0].assetCount").value(2))
    }

    @Test
    fun `GET portfolios returns empty list`() {
        given(portfolioService.findAll()).willReturn(emptyList())

        mvc.perform(get("/api/portfolios").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(0))
    }

    @Test
    fun `GET portfolio by id returns 200`() {
        given(portfolioService.findById(id)).willReturn(portfolioDto("REER"))

        mvc.perform(get("/api/portfolios/$id").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("REER"))
            .andExpect(jsonPath("$.id").value(id.toString()))
    }

    @Test
    fun `GET portfolio by id returns 404 when not found`() {
        given(portfolioService.findById(id)).willThrow(NoSuchElementException("Portfolio $id not found"))

        mvc.perform(get("/api/portfolios/$id").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `GET assets returns 200 with list`() {
        given(portfolioService.findAssets(id)).willReturn(listOf(assetDto()))

        mvc.perform(get("/api/portfolios/$id/assets").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].ticker").value("AAPL"))
    }

    @Test
    fun `GET assets returns 404 when portfolio not found`() {
        given(portfolioService.findAssets(id)).willThrow(NoSuchElementException("Portfolio $id not found"))

        mvc.perform(get("/api/portfolios/$id/assets").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound)
    }
}
