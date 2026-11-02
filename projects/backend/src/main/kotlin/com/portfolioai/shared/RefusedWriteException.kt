package com.portfolioai.shared

/** A code the frontend translates, implemented by each module's enum of refusals. */
interface RefusalCode {
  val name: String
}

/**
 * A write refused for a reason the user can act on. [code] is what the frontend translates ; the
 * message stays in English for the API's other callers.
 */
class RefusedWriteException(val code: RefusalCode, message: String) :
  IllegalArgumentException(message)

inline fun refuseUnless(condition: Boolean, code: RefusalCode, message: () -> String) {
  if (!condition) throw RefusedWriteException(code, message())
}
