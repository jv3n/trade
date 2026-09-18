package com.portfolioai.journal.domain

/**
 * Whether a [TradeExecution] opens/adds to the position (`ENTRY`) or closes/reduces it (`EXIT`),
 * independent of the position [TradeDirection]. A SHORT position's ENTRY is a sell-to-open and its
 * EXIT a buy-to-cover ; a BUY position's ENTRY is a buy-to-open and its EXIT a sell-to-close. Names
 * must match the Postgres enum `execution_kind` values (case-sensitive).
 */
enum class ExecutionKind {
  ENTRY,
  EXIT,
}
