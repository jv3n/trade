# CRAP report

Finds the functions that are both complex and under-tested, in the Angular frontend and the Kotlin backend.

```
CRAP(fn) = CC² × (1 − coverage)³ + CC
```

| CRAP | Band |
| --- | --- |
| below 5 | low |
| 5 to 15 | moderate |
| 15 to 30 | high |
| above 30 | critical |

The target is 15. A function at `CC ≥ 15` cannot reach it with tests, since 100 % coverage gives `CRAP = CC` : the report lists those under « Refactor first ».

## Run it

```bash
# 1. Frontend coverage
cd projects/frontend && npm run test:coverage -- --watch=false

# 2. Backend coverage, then complexity. Run detekt again without -Pcrap to get the usual findings back.
cd ../backend && ./gradlew test koverXmlReport && ./gradlew detektMain -Pcrap

# 3. The report
cd ../../tooling && npm run crap
```

One side alone works : the other is reported as missing. `--lcov`, `--kover` and `--sarif` read the inputs from another path, such as the CI's coverage artifacts. `--top` sets the length of the tables, 30 by default.

Each run writes `crap/last.json` (gitignored), and the next one says what moved since.

## How it reads

- **Complexity** : TypeScript through the compiler API, which needs `projects/frontend/node_modules` ; Kotlin from detekt's SARIF.
- **Coverage** : the lines of the function covered, from the line hits of `lcov` and Kover, so both languages read alike.
- **Coverage is never estimated** : a function with no data is reported as unknown. A file no spec imports is absent from `lcov`, so it reads unknown, not 0 %.

## Known limits

- Angular templates are not read, so a component's complexity is understated.
- A nested function counts in its parent. A class field counts only when it holds a function, such as a `computed()`.
- `?.` does not count as a branch.
- detekt gives where a Kotlin function starts, not where it ends : its range runs to the next function, so lines between two functions land in the former.
- `libs/ui` is not scored : `npm run test:coverage` does not cover it.
- `devdata/` and `e2e/` are not scored : the local seed and test-only endpoints never reach production.

## Test the tool

```bash
cd tooling && node --test crap/core.test.mjs
```
