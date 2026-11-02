package com.portfolioai.shared

/** A write sent from a copy of the row that something else has changed since : a 409. */
class StaleWriteException : RuntimeException("This row changed since it was read — reload it")

/** A null [sent] is a caller that read nothing to compare, and passes. */
fun requireFresh(sent: Long?, current: Long?) {
  if (sent != null && sent != current) throw StaleWriteException()
}
