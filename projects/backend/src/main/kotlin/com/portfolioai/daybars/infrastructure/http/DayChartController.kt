package com.portfolioai.daybars.infrastructure.http

import com.portfolioai.daybars.application.DayBarsService
import com.portfolioai.daybars.application.dto.DayChartDto
import io.swagger.v3.oas.annotations.tags.Tag
import java.util.UUID
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RestController

@Tag(
  name = "Day chart",
  description =
    "The 1-min bars of a stat's day, for its chart : found, not fetched yet, or none served. Read " +
      "through a stat of the caller.",
)
@RestController
class DayChartController(private val service: DayBarsService) {

  @GetMapping("/api/stats/{id}/bars")
  fun ofStat(@PathVariable id: UUID): DayChartDto = service.chartOfStat(id)
}
