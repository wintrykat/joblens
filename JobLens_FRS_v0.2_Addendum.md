# JobLens — FRS addendum v0.2

| | |
|---|---|
| **Product** | JobLens |
| **Document** | Functional Requirements Addendum |
| **Version** | 0.2 |
| **Date** | 2026-07-13 |
| **Status** | Implemented (defaults; questionnaire unanswered at build time) |
| **Parent** | [JobLens_MVP_Functional_Requirements.md](JobLens_MVP_Functional_Requirements.md) v0.1 |

This addendum locks Phase 1–2 of the improvement plan using **plan defaults** where the operator questionnaire was not answered.

---

## Defaults applied

| Question | Default chosen |
|---|---|
| Boards after Built In / ZipRecruiter | Indeed, LinkedIn Jobs, Greenhouse, Lever, Ashby |
| Launcher on list pages? | **No** — posting URLs only (`isPostingUrl`) |
| Top Phase 2 features | (1) Structured JSON export · (2) Deterministic ZIP geo |
| System of record | Clipboard JSON (`joblens.triage/v1`); no Notion write-back |
| Constraints | Manual scan only; network = Anthropic only; no ATS backfill; no auto-scan |

---

## FR deltas

### Multi-board registry

| ID | Priority | Requirement |
|---|---|---|
| FR-BRD-01 | M | Supported sites are defined in a single registry (`src/lib/boards.js`) with id, name, match patterns, optional posting-URL test, optional page-text extractor. |
| FR-BRD-02 | M | Manifest `content_scripts.matches` is derived from the registry (`MATCH_PATTERNS`). |
| FR-BRD-03 | M | The floating launcher mounts only when `isPostingUrl` passes (or when no test is defined). |
| FR-BRD-04 | M | Popup unsupported copy lists registry display names. |
| FR-BRD-05 | M | v0.2 boards: Built In, ZipRecruiter, Indeed, LinkedIn Jobs, Greenhouse, Lever, Ashby. |

### JSON export

| ID | Priority | Requirement |
|---|---|---|
| FR-EXP-03 | M | Operator can copy a structured JSON payload (`schema: "joblens.triage/v1"`) from the results panel and the bookmarks page. |
| FR-EXP-04 | M | JSON includes url, board, company, title, masthead, geo (with method), skillMatches (with reason), dealbreakers, skipFlags, postingSmell, declutteredJD. |

### Deterministic geo

| ID | Priority | Requirement |
|---|---|---|
| FR-GEO-01 | M | When a US ZIP can be resolved from the posting text and operator locations have centroids, onsite/hybrid geo uses haversine distance vs configured radius (`method: "zip-haversine"`). |
| FR-GEO-02 | M | Deterministic geo overrides the model geo for onsite/hybrid/unclear when computable; remote residency remains model judgment. |
| FR-GEO-03 | S | Panel marks computed geo with a "computed" badge. |

### Polish

| ID | Priority | Requirement |
|---|---|---|
| FR-BM-04 | S | Bookmarks page shows transient "Copied" feedback for markdown and JSON. |
| FR-UI-09 | S | Results panel detects an existing bookmark for the current URL and disables Bookmark until a new save is needed after rescan (still de-dupes by URL). |

---

## Explicitly still out of scope

Unchanged from parent §1.3 except where overridden above: auto-scan, ATS primary-page backfill, Notion/Obsidian write-back, non-ZIP location entry UI, multi-user sync.

---

## Acceptance (v0.2)

- [x] Extension builds; `dist/manifest.json` lists all registry match patterns.
- [x] Launcher absent on Indeed/LinkedIn **search** URLs; present on a posting URL pattern for each board (URL-test unit checks via `npm run smoke`).
- [x] Copy JSON from panel/bookmarks yields parseable `joblens.triage/v1`.
- [x] Given posting text containing ZIP `78701` and a configured location `78758`/25mi, geo method is `zip-haversine` with a numeric distance.
- [ ] Parent MVP DoD still applies for Built In + ZipRecruiter once loaded in Chrome with an API key.

---

## Traceability

| Area | Source |
|---|---|
| Board registry | `src/lib/boards.js` |
| ZIP centroids | `src/data/zipCentroids.json` |
| Geo haversine + override | `src/lib/geo.js`, `src/background/service-worker.js` |
| JSON export | `src/lib/jsonExport.js` |
| Manifest matches | `src/manifest.js` ← `MATCH_PATTERNS` |
