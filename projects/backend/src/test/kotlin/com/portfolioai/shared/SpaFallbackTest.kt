package com.portfolioai.shared

import java.nio.file.Files
import java.nio.file.Path
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.core.io.FileSystemResource

/**
 * What the prod jar serves for a path (#644) — a client route falls back to index.html, but a file
 * the build does not have is a 404.
 *
 * The failure protected : after a deploy, a tab still on the previous version asks for a chunk the
 * new build no longer has. Answered with index.html, the browser fails the import on a page of
 * HTML, and the edge caches that page for a year under the chunk's name — a later build producing
 * the same content-hashed name would then be served HTML until a purge.
 */
class SpaFallbackTest {

  @TempDir lateinit var static: Path
  private lateinit var location: FileSystemResource

  @BeforeEach
  fun setUp() {
    Files.writeString(static.resolve("index.html"), "<!doctype html>")
    Files.writeString(static.resolve("main-5IMXFVDL.js"), "export {}")
    location = FileSystemResource("$static/")
  }

  @Test
  fun `an existing file is served as is`() {
    assertEquals("main-5IMXFVDL.js", spaResource("main-5IMXFVDL.js", location)?.filename)
  }

  @Test
  fun `a client route falls back to index html, so a refresh on it does not 404`() {
    val trade = "journal/3f1c9a2e-7b44-4d1e-9c0a-2b6f1e8d5a10"
    assertEquals("index.html", spaResource(trade, location)?.filename)
    assertEquals("index.html", spaResource("settings/data", location)?.filename)
  }

  @Test
  fun `a chunk the build does not have is a 404, never index html`() {
    assertNull(spaResource("chunk-Bzn4ydz-.js", location))
    assertNull(spaResource("main-OLD.js.map", location))
    assertNull(spaResource("img/logo/gone.svg", location))
  }

  @Test
  fun `the backend's own paths are handed back to Spring`() {
    assertNull(spaResource("api/me", location))
    assertNull(spaResource("actuator/health", location))
  }
}
