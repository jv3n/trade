package com.portfolioai.analysis.infrastructure

import java.time.Clock
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Module-level configuration for the analysis bounded context.
 *
 * Carries the one explicit [Clock] bean of the app today — consumed by [JobEventPublisher] for
 * stamping events and computing the `pruneStale` cutoff. The bean exists so the Spring wiring is
 * **deterministic** : without it, a future module declaring a competing `@Bean Clock` (e.g. a
 * UTC-offset clock for some other purpose) would be auto-wired into `JobEventPublisher` and
 * silently change the cutoff semantics. With this bean in place, that scenario surfaces as a loud
 * `NoUniqueBeanDefinitionException` at boot.
 */
@Configuration
class AnalysisConfig {

  @Bean fun clock(): Clock = Clock.systemUTC()
}
