package com.portfolioai.backend.portfolio

import com.portfolioai.backend.portfolio.dto.AssetDto
import com.portfolioai.backend.portfolio.dto.CreateAssetRequest
import com.portfolioai.backend.portfolio.dto.CreatePortfolioRequest
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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreatePortfolioRequest): PortfolioDto =
        portfolioService.create(request)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: UUID) = portfolioService.delete(id)

    @GetMapping("/{id}/assets")
    fun findAssets(@PathVariable id: UUID): List<AssetDto> =
        portfolioService.findAssets(id)

    @PostMapping("/{id}/assets")
    @ResponseStatus(HttpStatus.CREATED)
    fun addAsset(
        @PathVariable id: UUID,
        @RequestBody request: CreateAssetRequest
    ): AssetDto = portfolioService.addAsset(id, request)

    @DeleteMapping("/{id}/assets/{assetId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun removeAsset(
        @PathVariable id: UUID,
        @PathVariable assetId: UUID
    ) = portfolioService.removeAsset(id, assetId)
}

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(ex: NoSuchElementException): ResponseEntity<Map<String, String>> =
        ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("error" to (ex.message ?: "Not found")))

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleBadRequest(ex: IllegalArgumentException): ResponseEntity<Map<String, String>> =
        ResponseEntity.badRequest().body(mapOf("error" to (ex.message ?: "Bad request")))
}
