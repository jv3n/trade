package com.portfolioai.backend.portfolio

import com.portfolioai.backend.portfolio.dto.AssetDto
import com.portfolioai.backend.portfolio.dto.PortfolioDto
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

@RestController
@RequestMapping("/api/portfolios")
class PortfolioController(private val portfolioService: PortfolioService) {

    @GetMapping
    fun findAll(): List<PortfolioDto> = portfolioService.findAll()

    @GetMapping("/{id}")
    fun findById(@PathVariable id: UUID): PortfolioDto = portfolioService.findById(id)

    @GetMapping("/{id}/assets")
    fun findAssets(@PathVariable id: UUID): List<AssetDto> =
        portfolioService.findAssets(id)
}

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(ex: NoSuchElementException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to (ex.message ?: "Not found")))
}
