package com.portfolioai.market.application.dto

import com.portfolioai.market.domain.SymbolMatch

/** Outbound representation of a symbol search match for the front. */
data class SymbolMatchDto(val symbol: String, val name: String, val exchange: String)

fun SymbolMatch.toDto() = SymbolMatchDto(symbol = symbol, name = name, exchange = exchange)
