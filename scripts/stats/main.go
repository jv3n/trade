// Command stats transforms a raw Google-Sheet paste of trade-stats rows into the import CSV
// consumed by POST /api/stats/import (decoder: backend StatEntryCsvDecoder).
//
// The input is the tab-separated dump the user keeps in their sheet. Each row carries the manual
// setup columns + price levels AND three already-computed percentage columns (Push, %LOD, %EOD).
// Those three are dropped here on purpose: the backend recomputes them at insert time (StatMetrics),
// so the import CSV must NOT contain them.
//
// Source layout (tab-separated), 0-based column index:
//
//	0  Date              -> Date
//	1  Ticker            -> Ticker (upper-cased)
//	2  Gap Up   "61%"    -> Gap Up           (% stripped -> 61)
//	3  Float    "10M"    -> Float            (M/m suffix stripped -> 10, millions)
//	4  Institutions %    -> Institutions %   (% stripped)
//	5  >20% Inst?  yes/no -> true/false
//	6  <$1 stock?  yes/no -> true/false
//	7  SSR?        yes/no -> true/false
//	8  Entry after 11AM?  -> true/false   (blank -> false)
//	9  Notes             -> Notes
//	10 (blank spacer)
//	11 Open     "$1.07"  -> Open   ($/spaces stripped)
//	12 High              -> High
//	13 Push %            -> DROPPED (recomputed by backend)
//	14 LOD price         -> LOD (Low of Day)
//	15 %LOD              -> DROPPED
//	16 EOD price         -> EOD (End of Day)
//	17 %EOD              -> DROPPED
//
// Rows are skipped (and reported) when a required price is missing/non-positive (e.g. a halted
// ticker with empty LOD/EOD) or a placeholder row carries only a date + ticker. The tool also
// re-derives Push/%LOD/%EOD from the extracted prices and flags any row that drifts from the
// source percentage by more than the tolerance — a self-check that the column alignment held.
//
// Usage — paste the Excel into input/input.txt, then run via the IDE ▶ button or:
//
//	go run .            # reads ./input/input.txt, (over)writes ./output/stats-data-prod.csv
//	go run . -tol 0.5   # tune the drift-warning threshold
//
// Both paths are hardcoded relative to this source file, so the ▶ button works from any cwd. Each
// run overwrites output/stats-data-prod.csv.
package main

import (
	"encoding/csv"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

// defaultOutName is the CSV file written when -out points at a directory.
const defaultOutName = "stats-data-prod.csv"

// headers is the order-locked column layout the backend decoder expects, verbatim.
var headers = []string{
	"Date", "Ticker", "Gap Up", "Float", "Institutions %",
	">20% Inst?", "<$1 stock?", "SSR?", "Entry after 11AM?", "Notes",
	"Open", "High", "LOD (Low of Day)", "EOD (End of Day)",
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// result is the outcome of transforming a raw dump — testable without touching the filesystem.
type result struct {
	rows       [][]string
	skipped    []string
	mismatches []string
	perMonth   map[string]int
}

func main() {
	tol := flag.Float64("tol", 0.5, "max drift (in % points) between recomputed and source Push/%LOD/%EOD before flagging")
	flag.Parse()

	// Hardcoded single-file workflow: drop the Excel copy into input/input.txt, the CSV is written to
	// output/. Paths anchor on the source file (not the cwd) so the IDE ▶ works from anywhere.
	dir := scriptDir()
	inPath := filepath.Join(dir, "input", "input.txt")
	outPath := filepath.Join(dir, "output", defaultOutName)

	raw, err := os.ReadFile(inPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", inPath, err)
		os.Exit(1)
	}

	res := transform(string(raw), *tol)

	if err := writeCSV(outPath, res.rows); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", outPath, err)
		os.Exit(1)
	}

	fmt.Printf("WROTE %d rows -> %s\n", len(res.rows), outPath)
	fmt.Printf("Per month: %s\n", formatPerMonth(res.perMonth))
	fmt.Printf("\nSKIPPED (%d):\n", len(res.skipped))
	for _, s := range res.skipped {
		fmt.Println("  " + s)
	}
	fmt.Printf("\nMISMATCHES vs source %% (%d):\n", len(res.mismatches))
	for _, m := range res.mismatches {
		fmt.Println("  " + m)
	}
}

// transform parses the raw dump and returns the import rows plus diagnostics. Pure (no IO) so the
// tests can exercise every branch with inline fixtures.
func transform(raw string, tol float64) result {
	res := result{perMonth: map[string]int{}}

	// Strip a leading UTF-8 BOM the sheet/Excel may prepend, then split on CRLF or LF.
	raw = strings.TrimPrefix(raw, string([]byte{0xEF, 0xBB, 0xBF}))
	lines := regexp.MustCompile(`\r?\n`).Split(raw, -1)

	for i, line := range lines {
		lineNo := i + 1
		if strings.Contains(line, "B Play") {
			continue // a different, unsupported sheet schema — never mapped
		}
		cells := strings.Split(line, "\t")
		date := strings.TrimSpace(get(cells, 0))
		if !dateRe.MatchString(date) {
			continue // header / "Monthly Average" / blank / fragment rows
		}

		ticker := strings.ToUpper(strings.TrimSpace(get(cells, 1)))

		open := cleanPrice(get(cells, 11))
		high := cleanPrice(get(cells, 12))
		lod := cleanPrice(get(cells, 14))
		eod := cleanPrice(get(cells, 16))
		if bad := badPrices(open, high, lod, eod); len(bad) > 0 {
			label := ticker
			if label == "" {
				label = date
			}
			res.skipped = append(res.skipped, fmt.Sprintf("L%d %s: missing/invalid price(s) %s — skipped", lineNo, label, strings.Join(bad, ",")))
			continue
		}

		gap := cleanNum(get(cells, 2))
		flt := cleanNum(get(cells, 3))
		inst := cleanNum(get(cells, 4))
		if bad := badNums(gap, flt, inst); len(bad) > 0 {
			res.skipped = append(res.skipped, fmt.Sprintf("L%d %s: missing/invalid %s — skipped", lineNo, ticker, strings.Join(bad, ",")))
			continue
		}

		checkDrift(&res, lineNo, ticker, open, high, lod, eod, get(cells, 13), get(cells, 15), get(cells, 17), tol)

		res.rows = append(res.rows, []string{
			date, ticker, gap, flt, inst,
			boolCell(get(cells, 5)), boolCell(get(cells, 6)), boolCell(get(cells, 7)), boolCell(get(cells, 8)),
			strings.TrimSpace(get(cells, 9)),
			open, high, lod, eod,
		})
		res.perMonth[date[:7]]++
	}

	return res
}

// checkDrift re-derives Push/%LOD/%EOD from the extracted prices and records a diagnostic when the
// result drifts from the sheet's own percentage by more than tol — catches a misaligned column.
func checkDrift(res *result, lineNo int, ticker, open, high, lod, eod, srcPush, srcLod, srcEod string, tol float64) {
	o, _ := strconv.ParseFloat(open, 64)
	if o == 0 {
		return
	}
	pct := func(v string) float64 {
		x, _ := strconv.ParseFloat(v, 64)
		return (x - o) / o * 100
	}
	type check struct {
		name string
		got  float64
		src  string
	}
	for _, c := range []check{
		{"push", pct(high), srcPush},
		{"lod", pct(lod), srcLod},
		{"eod", pct(eod), srcEod},
	} {
		want, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(c.src), "%", ""), 64)
		if err != nil {
			continue
		}
		if diff := c.got - want; diff > tol || diff < -tol {
			res.mismatches = append(res.mismatches, fmt.Sprintf("L%d %s %s: computed %.2f vs source %s", lineNo, ticker, c.name, c.got, c.src))
		}
	}
}

// cleanNum strips a trailing % and a single trailing M/m (millions suffix), keeping the number text
// verbatim so precision is never re-formatted ("4.7m" -> "4.7", "10M" -> "10", "1.9%" -> "1.9").
func cleanNum(s string) string {
	t := strings.TrimSpace(s)
	t = strings.ReplaceAll(t, "%", "")
	t = strings.TrimSpace(t)
	if t != "" {
		if last := t[len(t)-1]; last == 'M' || last == 'm' {
			t = strings.TrimSpace(t[:len(t)-1])
		}
	}
	return t
}

// cleanPrice removes every "$" and all whitespace, tolerating both "$1.07" and "1.16 $".
func cleanPrice(s string) string {
	t := strings.ReplaceAll(s, "$", "")
	return strings.Join(strings.Fields(t), "")
}

// boolCell maps the sheet's yes/no (and blank) to the decoder's required true/false. Blank -> false.
func boolCell(s string) string {
	if strings.EqualFold(strings.TrimSpace(s), "yes") {
		return "true"
	}
	return "false"
}

func badPrices(open, high, lod, eod string) []string {
	var bad []string
	for _, p := range []struct{ name, v string }{{"Open", open}, {"High", high}, {"LOD", lod}, {"EOD", eod}} {
		if v, err := strconv.ParseFloat(p.v, 64); p.v == "" || err != nil || v <= 0 {
			bad = append(bad, p.name)
		}
	}
	return bad
}

func badNums(gap, flt, inst string) []string {
	var bad []string
	for _, n := range []struct{ name, v string }{{"Gap Up", gap}, {"Float", flt}, {"Institutions %", inst}} {
		if _, err := strconv.ParseFloat(n.v, 64); n.v == "" || err != nil {
			bad = append(bad, n.name)
		}
	}
	return bad
}

// get returns the i-th cell or "" when the row is shorter (placeholder rows with only date+ticker).
func get(cells []string, i int) string {
	if i < len(cells) {
		return cells[i]
	}
	return ""
}

func formatPerMonth(m map[string]int) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s:%d", k, m[k]))
	}
	return "{" + strings.Join(parts, " ") + "}"
}

// scriptDir returns the directory holding this source file, resolved at build time via the call
// stack. Used to anchor the default input/output paths so the IDE ▶ button works from any cwd.
func scriptDir() string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return "."
	}
	return filepath.Dir(file)
}

// writeCSV (over)writes the import CSV — os.Create truncates an existing file, so each run replaces
// the previous output.
func writeCSV(path string, rows [][]string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f) // default: comma separator, LF line endings, minimal quoting
	if err := w.Write(headers); err != nil {
		return err
	}
	if err := w.WriteAll(rows); err != nil {
		return err
	}
	w.Flush()
	return w.Error()
}
