package com.portfolioai.shared

import java.time.Clock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** The app's clock, a bean so a test can fix « now ». */
@Configuration
class ClockConfig {

  @Bean fun clock(): Clock = Clock.systemUTC()
}
