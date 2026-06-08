package main

import (
	"strings"
	"testing"
)

// Spec for the stats sheet→CSV transform. Pins the cleaning rules (%, M, $, yes/no), the
// drop-the-computed-columns contract, the skip rules (bad prices, placeholder rows, B-Play schema)
// and the self-check that flags a row whose recomputed % drifts from the source.

// One full source row, tab-separated, matching the sheet's 18-column layout. Helper so each test
// overrides only the cells it cares about.
func row(cells ...string) string { return strings.Join(cells, "\t") }

// A clean BAC-like row: open 4.20, high 4.45, lod 3.05, eod 3.10 (push +5.95 / lod -27.38 / eod -26.19).
func sampleRow() string {
	return row(
		"2026-06-04", "bac", "52%", "12.5M", "8.3%", // 0-4
		"no", "no", "no", "no", "Clean GUS fade", "", // 5-10 (10 = blank spacer)
		"$4.200", "$4.450", "5.95%", "$3.050", "-27.38%", "$3.100", "-26.19%", // 11-17
	)
}

func TestTransformCleanRow(t *testing.T) {
	res := transform(sampleRow(), 0.5)

	if len(res.rows) != 1 {
		t.Fatalf("want 1 row, got %d (skipped: %v)", len(res.rows), res.skipped)
	}
	got := res.rows[0]
	want := []string{
		"2026-06-04", "BAC", "52", "12.5", "8.3",
		"false", "false", "false", "false", "Clean GUS fade",
		"4.200", "4.450", "3.050", "3.100",
	}
	if len(got) != len(headers) {
		t.Fatalf("want %d columns, got %d", len(headers), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("col %q: want %q, got %q", headers[i], want[i], got[i])
		}
	}
	if len(res.mismatches) != 0 {
		t.Errorf("clean row should not drift: %v", res.mismatches)
	}
}

func TestTransformUppercasesTickerAndYesMapsTrue(t *testing.T) {
	r := row("2026-02-05", "aim", "62%", "3M", "3%",
		"no", "no", "yes", "no", "SSR", "",
		"$1.720", "$1.880", "9.30%", "1.16 $", "-32.56%", "1.23 $", "-28.49%")

	got := transform(r, 0.5).rows[0]
	if got[1] != "AIM" {
		t.Errorf("ticker should be upper-cased, got %q", got[1])
	}
	if got[7] != "true" {
		t.Errorf("SSR? = yes should map to true, got %q", got[7])
	}
	// "1.16 $" / "1.23 $" — trailing-dollar format must be cleaned to a bare number.
	if got[12] != "1.16" || got[13] != "1.23" {
		t.Errorf("trailing-$ prices not cleaned: LOD=%q EOD=%q", got[12], got[13])
	}
}

func TestTransformDropsComputedColumns(t *testing.T) {
	got := transform(sampleRow(), 0.5).rows[0]
	if len(got) != 14 {
		t.Fatalf("import CSV must have 14 columns (Push/%%LOD/%%EOD dropped), got %d", len(got))
	}
}

func TestTransformSkipsMissingPrice(t *testing.T) {
	// A halted ticker: LOD and EOD blank, %s show -100%.
	r := row("2026-05-26", "NCRA", "91%", "7.5M", "2.1%",
		"no", "yes", "no", "no", "EXPENSIVE shares", "",
		"$0.460", "$0.600", "30.43%", "", "-100.00%", "", "-100.00%")

	res := transform(r, 0.5)
	if len(res.rows) != 0 {
		t.Fatalf("row with empty LOD/EOD must be skipped, got %d rows", len(res.rows))
	}
	if len(res.skipped) != 1 || !strings.Contains(res.skipped[0], "NCRA") || !strings.Contains(res.skipped[0], "LOD") {
		t.Errorf("skip diagnostic should name NCRA + LOD, got %v", res.skipped)
	}
}

func TestTransformSkipsPlaceholderRow(t *testing.T) {
	res := transform(row("2026-06-03", "SELX"), 0.5)
	if len(res.rows) != 0 || len(res.skipped) != 1 {
		t.Fatalf("placeholder date+ticker row must be skipped, got rows=%d skipped=%d", len(res.rows), len(res.skipped))
	}
}

func TestTransformIgnoresBPlaySchema(t *testing.T) {
	// Header carrying "B Play" must neutralise nothing else but the line itself; the data row below
	// it (a B-Play row with a real date) is still skipped because the parser never trusts that schema.
	bplay := "Date\tTicker\tGap Up\tFloat\tInstitutions %\tB Play (Yes/No)\tNotes"
	dataRow := row("2026-02-06", "REVB", "50%", "5M", "52%", "No", "", "",
		"53.51 $", "60.48 $", "13.03%", "28.32 $", "-47.08%", "31.68 $", "-40.80%")

	res := transform(bplay+"\n"+dataRow, 0.5)
	// REVB's col index 5 is "No" (B-Play), not a >20% flag — mapping it would corrupt the row, so it
	// must NOT be emitted. It is dropped here because its price columns don't line up to valid values.
	for _, r := range res.rows {
		if r[1] == "REVB" {
			t.Errorf("B-Play row must not be emitted, got %v", r)
		}
	}
}

func TestTransformFlagsDrift(t *testing.T) {
	// Open says 0.32 but the sheet's % imply ~0.318 — the classic display-rounding case. With a
	// tight tolerance it must be flagged; the row is still emitted (data is usable).
	r := row("2026-02-04", "MOBX", "72%", "84M", "5%",
		"no", "yes", "no", "no", "Big float", "",
		"0.32 $", "0.34 $", "6.98%", "0.21 $", "-33.02%", "0.23 $", "-26.67%")

	res := transform(r, 0.5)
	if len(res.rows) != 1 {
		t.Fatalf("drifting row should still be emitted, got %d rows", len(res.rows))
	}
	if len(res.mismatches) == 0 {
		t.Errorf("expected a drift diagnostic for MOBX")
	}
}

func TestCleaningHelpers(t *testing.T) {
	cases := []struct{ in, want string }{
		{"61%", "61"}, {"1.9%", "1.9"}, {"0%", "0"},
		{"10M", "10"}, {"4.7m", "4.7"}, {"30", "30"}, {"270M", "270"},
	}
	for _, c := range cases {
		if got := cleanNum(c.in); got != c.want {
			t.Errorf("cleanNum(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	prices := []struct{ in, want string }{
		{"$1.070", "1.070"}, {"0.32 $", "0.32"}, {"1.16 $", "1.16"}, {"$0.288", "0.288"},
	}
	for _, c := range prices {
		if got := cleanPrice(c.in); got != c.want {
			t.Errorf("cleanPrice(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	if boolCell("yes") != "true" || boolCell("YES") != "true" {
		t.Error("yes (any case) should map to true")
	}
	if boolCell("no") != "false" || boolCell("") != "false" {
		t.Error("no and blank should map to false")
	}
}
