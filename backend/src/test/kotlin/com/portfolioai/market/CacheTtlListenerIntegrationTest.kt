package com.portfolioai.market

import com.portfolioai.config.application.ConfigChangedEvent
import com.portfolioai.config.application.ConfigKeys
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.never
import org.mockito.kotlin.reset
import org.mockito.kotlin.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.cache.caffeine.CaffeineCacheManager
import org.springframework.context.ApplicationEventPublisher
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/**
 * Pin the transactional contract of [CacheTtlListener] : the cache spec must NOT be rebuilt when
 * the surrounding transaction rolls back. Audit 2026-05-06 finding #5.
 *
 * Why integration-level rather than unit : `@TransactionalEventListener(AFTER_COMMIT)` is wired by
 * Spring's transaction synchronization manager — there's no way to exercise the commit-vs-rollback
 * branching without a real `PlatformTransactionManager`. We use the full `@SpringBootTest` context
 * (already booted by `BackendApplicationTests`) and spy on the bean's `CaffeineCacheManager` to
 * count `setCaffeine` calls.
 *
 * The `AppConfigService.set` path is **not** exercised here on purpose — it's the *event*-side
 * behaviour we're pinning, regardless of who publishes the event. This decouples the test from any
 * future change in how `set` decides to publish.
 */
@SpringBootTest
@TestPropertySource(properties = ["anthropic.api.key=test-key-ci-only"])
class CacheTtlListenerIntegrationTest {

  @Autowired private lateinit var publisher: ApplicationEventPublisher
  @Autowired private lateinit var txManager: PlatformTransactionManager
  @MockitoSpyBean private lateinit var cacheManager: CaffeineCacheManager

  @Test
  fun `setCaffeine is called when the event is published in a committed transaction`() {
    // Baseline : reset the spy so we don't pick up the `setCaffeine` call that `MarketConfig`
    // performs at boot to seed the spec from the YAML default. We're testing the listener path
    // specifically, not the bean factory.
    reset(cacheManager)
    val tx = TransactionTemplate(txManager)

    tx.execute<Unit> { _ ->
      publisher.publishEvent(ConfigChangedEvent(ConfigKeys.CACHE_TTL_MINUTES, "30"))
      null
    }

    verify(cacheManager).setCaffeine(any<com.github.benmanes.caffeine.cache.Caffeine<Any, Any>>())
  }

  @Test
  fun `setCaffeine is NOT called when the transaction rolls back`() {
    // The audit-finding #5 scenario : a transaction publishes the event then rolls back (lock
    // conflict, BDD anomaly, exception in a sibling step). Pre-fix the listener would already
    // have flushed the cache for a config that never landed in the DB. Post-fix the AFTER_COMMIT
    // phase keeps it in sync.
    reset(cacheManager)
    val tx = TransactionTemplate(txManager)

    tx.execute<Unit> { status ->
      publisher.publishEvent(ConfigChangedEvent(ConfigKeys.CACHE_TTL_MINUTES, "30"))
      status.setRollbackOnly()
      null
    }

    verify(cacheManager, never())
      .setCaffeine(any<com.github.benmanes.caffeine.cache.Caffeine<Any, Any>>())
  }

  @Test
  fun `setCaffeine ignores events that do not target the TTL key`() {
    // Defensive : a sibling config change (e.g. a provider toggle) publishes its own event on the
    // same channel. The listener must not rebuild the cache for keys it doesn't own — otherwise
    // every API key rotation would flush the market cache.
    reset(cacheManager)
    val tx = TransactionTemplate(txManager)

    tx.execute<Unit> { _ ->
      publisher.publishEvent(ConfigChangedEvent(ConfigKeys.MARKET_PROVIDER, "twelvedata"))
      null
    }

    verify(cacheManager, never())
      .setCaffeine(any<com.github.benmanes.caffeine.cache.Caffeine<Any, Any>>())
  }
}
