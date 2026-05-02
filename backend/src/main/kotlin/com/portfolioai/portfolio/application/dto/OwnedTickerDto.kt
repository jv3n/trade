package com.portfolioai.portfolio.application.dto

/**
 * Aggregate view of a ticker across all portfolios — used by the dashboard sidebar to expose a flat
 * clickable list of every symbol the user holds, regardless of which account it sits in.
 *
 * `portfolioCount` is informational : a ticker held in both CELI and REER shows `2`. The view is
 * purely a navigation shortcut to `/ticker/{ticker}` ; quantities and book values are not
 * aggregated here (the dossier itself displays the market data).
 */
data class OwnedTickerDto(val ticker: String, val name: String, val portfolioCount: Int)
