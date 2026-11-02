package com.portfolioai.shared

import com.portfolioai.journal.domain.TradeRefusal
import java.sql.SQLException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus

/**
 * Pins what a refused write answers (#843) : a value that doesn't fit is the input's fault, a 400,
 * where a « the resource already exists » 409 would send the user looking for a duplicate.
 */
class GlobalExceptionHandlerTest {

  private val handler = GlobalExceptionHandler()

  private fun refused(sqlState: String) =
    DataIntegrityViolationException("refused", SQLException("refused", sqlState))

  @Test
  fun `a number past its column is a 400`() {
    assertEquals(HttpStatus.BAD_REQUEST, handler.handleConflict(refused("22003")).statusCode)
  }

  @Test
  fun `a check constraint is a 400`() {
    assertEquals(HttpStatus.BAD_REQUEST, handler.handleConflict(refused("23514")).statusCode)
  }

  @Test
  fun `a unique collision stays a 409`() {
    assertEquals(HttpStatus.CONFLICT, handler.handleConflict(refused("23505")).statusCode)
  }

  @Test
  fun `a coded refusal is a 400 carrying the code the frontend translates`() {
    val response =
      handler.handleRefusedWrite(
        RefusedWriteException(TradeRefusal.FUTURE_DATE, "A trade can't be dated in the future")
      )

    assertEquals(HttpStatus.BAD_REQUEST, response.statusCode)
    assertEquals("FUTURE_DATE", response.body?.get("code"))
    assertEquals("A trade can't be dated in the future", response.body?.get("error"))
  }
}
