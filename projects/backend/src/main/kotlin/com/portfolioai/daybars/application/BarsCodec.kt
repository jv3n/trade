package com.portfolioai.daybars.application

import com.portfolioai.daybars.domain.Bar
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.math.BigDecimal
import java.time.Instant
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * A day of bars as gzipped text, one `epochSecond,open,high,low,close,volume` line a bar. Text
 * keeps the provider's prices exact, and its repeated digits compress some 4× better than doubles.
 */
object BarsCodec {

  fun encode(bars: List<Bar>): ByteArray {
    val out = ByteArrayOutputStream()
    GZIPOutputStream(out).bufferedWriter().use { writer ->
      bars.forEach {
        writer.write(
          "${it.time.epochSecond},${it.open.toPlainString()},${it.high.toPlainString()}," +
            "${it.low.toPlainString()},${it.close.toPlainString()},${it.volume}\n"
        )
      }
    }
    return out.toByteArray()
  }

  fun decode(bytes: ByteArray): List<Bar> =
    GZIPInputStream(ByteArrayInputStream(bytes)).bufferedReader().useLines { lines ->
      lines
        .filter { it.isNotEmpty() }
        .map { line ->
          val f = line.split(',')
          Bar(
            time = Instant.ofEpochSecond(f[0].toLong()),
            open = BigDecimal(f[1]),
            high = BigDecimal(f[2]),
            low = BigDecimal(f[3]),
            close = BigDecimal(f[4]),
            volume = f[5].toLong(),
          )
        }
        .toList()
    }
}
