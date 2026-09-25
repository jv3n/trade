package com.portfolioai.tradingday.infrastructure.http

import com.portfolioai.tradingday.application.TradingDayService
import com.portfolioai.tradingday.application.dto.TradingDayDto
import com.portfolioai.tradingday.application.dto.TradingDayRequest
import io.swagger.v3.oas.annotations.tags.Tag
import java.time.LocalDate
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Trading days",
  description =
    "The « nothing today » marks of the Today page — no candidate, no trade — per user and day.",
)
@RestController
@RequestMapping("/api/trading-days")
class TradingDayController(private val service: TradingDayService) {

  @GetMapping("/{date}")
  fun get(
    @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate
  ): TradingDayDto = service.get(date)

  /** Sets both marks at once ; clearing both removes the day's row. */
  @PutMapping("/{date}")
  fun put(
    @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) date: LocalDate,
    @RequestBody request: TradingDayRequest,
  ): TradingDayDto = service.put(date, request)
}
