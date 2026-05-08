package com.portfolioai.portfolio.application.dto

import com.portfolioai.portfolio.domain.AssetType

/**
 * Aggregate view of a ticker across all portfolios — used by the dashboard sidebar to expose a flat
 * clickable list of every symbol the user holds, regardless of which account it sits in.
 *
 * `portfolioCount` is informational : a ticker held in both CELI and REER shows `2`. The view is
 * purely a navigation shortcut to `/ticker/{ticker}` ; quantities and book values are not
 * aggregated here (the dossier itself displays the market data).
 *
 * `assetType` carries the portfolio-side bucket (`STOCK / ETF / CRYPTO / BOND / COMMODITY`) so the
 * dashboard sidebar can render a coloured chip next to the symbol — distinguishes at a glance an
 * ETF (XEQT) from an action (RY.TO) without clicking through to the dossier.
 */
data class OwnedTickerDto(
  val ticker: String,
  val name: String,
  val assetType: AssetType,
  val portfolioCount: Int,
)
