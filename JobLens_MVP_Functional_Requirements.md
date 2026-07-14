# JobLens — MVP Functional Requirements Specification

| | |
|---|---|
| **Product** | JobLens (Chrome extension) |
| **Document** | Functional Requirements Specification, MVP |
| **Version** | 0.1 |
| **Date** | 2026-07-13 |
| **Status** | Draft for build |
| **Owner** | Kat (single-operator tool) |
| **Scaffold reference** | `joblens.zip` (this build) |

---

## 1. Purpose and scope

### 1.1 Purpose

JobLens reduces the manual cost of triaging job postings. On a supported posting page, the operator triggers a single AI analysis that (a) reformats the posting into a fixed masthead, (b) evaluates the operator's held skills against the posting's requirements with cited evidence, (c) determines geographic eligibility, and (d) strips the posting down to its operative content. The goal is to raise the number of postings the operator can accurately assess per day without violating the terms of the sites involved and without scraping at scale.

### 1.2 In scope (MVP)

- Chrome extension, Manifest V3, built with Vite + CRXJS + React.
- Supported sites: Built In (`builtin.com`) and ZipRecruiter (`ziprecruiter.com`).
- In-browser configuration: API key, model, profile, locations, work-eligible regions, proficiencies, deficiencies, skip triggers, work history.
- Skills extraction from work history via the model, followed by a mandatory operator review-and-edit gate before the extracted inventory is trusted for matching.
- Manual-trigger scan only (floating launcher on the page, plus a popup action).
- Single-call posting analysis returning a structured result (masthead, geo verdict, skill match/mismatch with evidence, dealbreakers, skip-trigger flags, posting smell, decluttered posting).
- In-page results panel rendered in an isolated shadow root.
- Bookmarking of a scanned posting with its analysis, a bookmarks browser page, and copy-to-clipboard markdown export.

### 1.3 Out of scope (deferred to v2+)

The following are explicitly excluded from the MVP to protect the timeline. They are recorded here so they are added deliberately, not by drift.

- **Auto-scan on page load** and any site "watch list" registry. MVP is manual only.
- **Primary-posting backfill** (fetching the employer ATS page to fill missing masthead fields). Missing fields are reported as `unclear`, not backfilled.
- **Structured JSON export** shaped for Notion WSL / Obsidian ingest. MVP exports markdown to the clipboard only.
- **Deterministic geocoding / distance computation.** Geo eligibility in the MVP is a model judgment from ZIP + radius + the posting's stated location, not a computed distance (see NFR-07 and Assumption A-4).
- **Non-ZIP location entry** (city, non-US postal codes, coordinates, map picker).
- **Any write to the operator's existing systems of record** (Notion, Obsidian, TickTick, calendars). JobLens is a triage staging tool; it does not replace those.
- **Multi-user support, sync storage, key vaulting, or distribution.** Single profile, local storage, personal use.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Posting** | A single job-description page on a supported site. |
| **Masthead** | The fixed set of no-nonsense summary fields shown at the top of a result. |
| **Held skill** | A skill the operator possesses, sourced only from `proficiencies` or **saved** `extractedSkills`. |
| **Gap** | A skill the operator has explicitly marked as not held (`deficiencies`). |
| **Match / partial / mismatch** | Classification of a posting requirement against held skills. |
| **Dealbreaker** | A specifically-named, unmet hard requirement that gates the role regardless of other matches. |
| **Skip trigger** | An operator-defined condition that marks a posting as an automatic skip. |
| **Scan** | One operator-initiated analysis of the current posting. |
| **SW** | The extension background service worker. |

---

## 3. Actors

Single actor: **the operator** (Kat). No roles, no auth beyond the Anthropic API key. No second human or automated actor initiates any action; every network call is a direct consequence of an operator gesture.

---

## 4. Architecture context

Functional requirements below assume this component split. It is stated here only to make the requirements unambiguous; it is not itself a requirement list.

| Component | Responsibility |
|---|---|
| **Service worker** (`src/background/service-worker.js`) | The only component that calls the Anthropic API. Receives `EXTRACT_SKILLS` and `ANALYZE_JD` messages, builds prompts, parses JSON, returns results. |
| **Content script + panel** (`src/content/*`) | Injects a shadow-root launcher/panel on supported pages, extracts page text, requests analysis, renders results, handles bookmark and copy actions. |
| **Options page** (`src/options/*`) | Configuration UI, including work-history entry, extraction trigger, and the review-and-edit table. |
| **Popup** (`src/popup/*`) | Menu: scan this page, view bookmarks, open options. |
| **Bookmarks page** (`src/bookmarks/*`) | Lists saved postings; copy / delete. |
| **Storage** (`chrome.storage.local`) | Single `config` object. Readable and writable from all contexts. |

**Governing constraints** (elaborated as NFRs): network calls occur only in the SW (CSP boundary); the panel is style-isolated in a shadow root; every scan is a manual, single-call operation.

---

## 5. Functional requirements

Priority uses MoSCoW: **M** (Must), **S** (Should), **C** (Could). All MVP requirements are M unless marked.

### 5.1 Configuration and profile

| ID | Priority | Requirement |
|---|---|---|
| FR-CFG-01 | M | The operator can enter and persist an Anthropic API key. The key field is masked. |
| FR-CFG-02 | M | The operator can view and edit the model id used for all calls, defaulting to `claude-sonnet-5`. |
| FR-CFG-03 | M | The operator can enter highest education as free text. |
| FR-CFG-04 | M | The operator can maintain a list of proficiencies (held skills), one per line. |
| FR-CFG-05 | M | The operator can maintain a list of deficiencies (gaps), one per line. |
| FR-CFG-06 | M | The operator can maintain one or more onsite/hybrid locations, each a ZIP and a radius in miles, with add and remove. |
| FR-CFG-07 | M | The operator can maintain a list of remote work-eligible regions (e.g. `TX`, `PA`). |
| FR-CFG-08 | M | The operator can maintain a list of skip triggers, one per line, seeded with defaults (see Appendix B) and fully editable. |
| FR-CFG-09 | M | All configuration persists in `chrome.storage.local` under a single `config` key and survives browser restart. |
| FR-CFG-10 | M | A Save action writes the working config. No configuration change takes effect for analysis until saved. |

**Acceptance:** entering values, saving, closing and reopening the options page shows the saved values; a scan performed afterward reflects them.

### 5.2 Skills extraction and review

| ID | Priority | Requirement |
|---|---|---|
| FR-EXT-01 | M | The operator can add, edit, and remove work-history entries, each with org, title, start (`YYYY-MM`), end (`YYYY-MM` or `present`), and a free-text description. |
| FR-EXT-02 | M | The operator can trigger extraction, which sends the work history to the model and returns a list of skills, each with skill name, estimated years, source, and confidence. |
| FR-EXT-03 | M | The extractor must be instructed to stay conservative: list only skills the text supports, never invent skills or inflate years, and scope claims to what the text states (e.g. "built the auth module in Flutter" yields a scoped Flutter claim, not full application development). |
| FR-EXT-04 | M | Extracted skills are appended to an **editable review table**, de-duplicated against existing entries by case-insensitive skill name. |
| FR-EXT-05 | M | The operator can edit any extracted skill's name, years, source, and confidence, delete any row, and add rows manually. |
| FR-EXT-06 | M | Extracted skills are **not trusted for matching until the operator saves.** This gate is the honesty control and must not be bypassable. |
| FR-EXT-07 | S | After extraction, the UI states clearly that the results are provisional and require review before saving. |

**Acceptance:** running extraction on a populated history yields a table the operator can correct; unsaved extraction results never influence a scan.

### 5.3 Scan invocation

| ID | Priority | Requirement |
|---|---|---|
| FR-SCAN-01 | M | On a supported posting page, a persistent floating launcher is shown. No analysis runs until the operator activates it. |
| FR-SCAN-02 | M | Activating the launcher initiates exactly one scan of the current page. |
| FR-SCAN-03 | M | The popup provides a "Scan this page" action that initiates a scan on the active tab when it is a supported page. |
| FR-SCAN-04 | M | If the popup scan is invoked on an unsupported page, the operator is told JobLens runs only on the supported sites, with no error thrown. |
| FR-SCAN-05 | M | The operator can rescan from the results panel. |
| FR-SCAN-06 | M | No scan is ever initiated automatically by page load, navigation, or any non-operator event. |

**Acceptance:** loading a supported page performs zero API calls until the operator clicks; clicking performs exactly one analysis call.

### 5.4 Page content acquisition

| ID | Priority | Requirement |
|---|---|---|
| FR-PAGE-01 | M | On scan, the content script extracts page text using a heuristic: the largest inner text among `[role=main]`, `main`, `article`, and `body`. |
| FR-PAGE-02 | M | Extracted text is capped at 24,000 characters to bound token cost and keep volume human-scale. |
| FR-PAGE-03 | M | The current page URL is captured and passed with the text. |
| FR-PAGE-04 | S | The model, not the extractor, is responsible for isolating the posting from residual navigation, related-jobs, and footer content in the captured text. |

**Acceptance:** on a supported posting, the captured text contains the job description body; the analysis result reflects the actual role, not sidebar or footer content.

### 5.5 Posting analysis

Each scan produces a single structured result. The model output contract is specified in §7.3.

| ID | Priority | Requirement |
|---|---|---|
| FR-ANL-01 | M | The analysis returns a masthead: organization, title, work model (`onsite`/`hybrid`/`remote`/`unclear`), travel band, employment terms, health insurance, pay range as written, seniority, and work-authorization notes (sponsorship / citizenship / clearance). |
| FR-ANL-02 | M | Any masthead field the posting does not state is returned as `unclear`, `none`, or empty as appropriate. Fields are never fabricated. |
| FR-ANL-03 | M | The analysis returns a geo verdict of `eligible` / `excluded` / `unclear` with a reason that names the constraint and the location or region it was checked against. |
| FR-ANL-04 | M | The analysis returns a list of skill evaluations, each with the requirement, a status of `match`/`partial`/`mismatch`, the exact posting line as evidence, a reason, and a confidence. |
| FR-ANL-05 | M | The analysis returns a separate dealbreakers list for specifically-named, unmet hard requirements. |
| FR-ANL-06 | M | The analysis returns a skip-flags list containing any configured skip trigger the posting matches, each with the triggering line. |
| FR-ANL-07 | S | The analysis returns a posting-smell note when the posting reads like PERM boilerplate, an evergreen/ghost posting, or a staffing-mill repost; otherwise empty. |
| FR-ANL-08 | M | The analysis returns a decluttered posting: operative qualifications first (required, then preferred), then core responsibilities, with marketing, HR/PR platitudes, and accolades removed, and at most a one-line culture note. Content is drawn only from the posting; nothing is invented. |

**Acceptance:** for a real posting, each returned flag can be traced to a line in the posting; missing information surfaces as `unclear` rather than a guess.

### 5.6 Skill-match reasoning rules

These rules define correct matching behavior and are the product's core differentiator. They are testable against the worked examples in Appendix A.

| ID | Priority | Rule |
|---|---|---|
| FR-MATCH-01 | M | **Alternative sets.** A requirement offering alternatives (X or Y or Z) is a match if the operator holds any one of them. |
| FR-MATCH-02 | M | **Category generalization.** A generic category requirement (e.g. "front-end JavaScript frameworks") is a match if the operator holds any specific instance of that category (e.g. Angular). |
| FR-MATCH-03 | M | **Specific hard-requirement gate.** A specifically-named technology the operator does not hold, stated as a hard or mandatory threshold (e.g. "8+ years of React required"), is a mismatch and a dealbreaker. A satisfied generic sibling line does not rescue it. |
| FR-MATCH-04 | M | **No cross-crediting.** Holding framework A never credits framework B. Angular experience is never counted as React experience. |
| FR-MATCH-05 | M | **Ground truth.** Only `proficiencies` and saved `extractedSkills` count as held. `deficiencies` are explicit gaps. Nothing else is inferred as held. |
| FR-MATCH-06 | M | **Evidence and confidence.** Every match, partial, and mismatch cites the exact posting line and carries a confidence value. |

**Acceptance:** all three Appendix A scenarios produce the stated verdicts.

### 5.7 Results presentation

| ID | Priority | Requirement |
|---|---|---|
| FR-UI-01 | M | Results render in a panel injected into a shadow root so host-page styles do not affect the panel and the panel's styles do not affect the host page. |
| FR-UI-02 | M | The panel shows a loading state during analysis and an error state on failure, with an actionable message. |
| FR-UI-03 | M | The masthead is presented as a compact labeled block at the top of the result. |
| FR-UI-04 | M | The geo verdict is visually distinguished by outcome (eligible / excluded / unclear). |
| FR-UI-05 | M | Skill evaluations are visually distinguished by status; dealbreakers and skip flags are visually separated from ordinary matches. |
| FR-UI-06 | M | The decluttered posting is shown in a scrollable region. |
| FR-UI-07 | M | The panel can be dismissed and reopened without a page reload. |

**Acceptance:** the panel renders correctly on both supported sites without visual interference in either direction.

### 5.8 Bookmarks

| ID | Priority | Requirement |
|---|---|---|
| FR-BM-01 | M | From a result, the operator can bookmark the posting, storing URL, company, title, timestamp, and the full analysis. |
| FR-BM-02 | M | Bookmarks are de-duplicated by URL; re-bookmarking a URL replaces the prior entry. |
| FR-BM-03 | M | The popup opens a bookmarks browser page listing saved postings with company, title, link, key masthead fields, and save date. |
| FR-BM-04 | M | From the bookmarks page, the operator can copy a saved posting's markdown and delete a bookmark. |

**Acceptance:** bookmarking on a page then opening the bookmarks page shows the entry; delete removes it permanently from storage.

### 5.9 Export

| ID | Priority | Requirement |
|---|---|---|
| FR-EXP-01 | M | From a result and from the bookmarks page, the operator can copy a markdown rendering of the analysis to the clipboard. |
| FR-EXP-02 | M | The markdown includes org/title, masthead, geo verdict, dealbreakers, skip flags, skills with status, posting-smell note, and the decluttered posting. |
| FR-EXP-03 | C | (Deferred; recorded for traceability) A richer structured JSON export shaped for the operator's trackers. Out of MVP scope per §1.3. |

**Acceptance:** the copied markdown pastes as valid, readable markdown containing all populated sections.

### 5.10 Popup and navigation

| ID | Priority | Requirement |
|---|---|---|
| FR-NAV-01 | M | The toolbar popup exposes exactly three actions: scan this page, view bookmarks, open options. |
| FR-NAV-02 | M | "Open options" opens the extension options page. |
| FR-NAV-03 | M | "View bookmarks" opens the bookmarks page in a new tab. |

---

## 6. Data model

Single `config` object in `chrome.storage.local`.

```
config = {
  apiKey: string,
  model: string,                       // default "claude-sonnet-5"
  education: string,
  proficiencies: string[],
  deficiencies: string[],
  locations: [ { zip: string, radiusMiles: number } ],
  workEligibleRegions: string[],       // e.g. ["TX","PA"]
  skipTriggers: string[],
  workHistory: [
    { org, title, start, end, description }   // strings; start/end "YYYY-MM" | "present"
  ],
  extractedSkills: [
    { skill: string, years: number, source: string, confidence: "high"|"medium"|"low" }
  ],
  bookmarks: [
    { url, company, title, savedAt, analysis }  // analysis = §7.3 object
  ]
}
```

**DM-01 (M):** `proficiencies` + `extractedSkills` are the sole authority for held skills used in matching.
**DM-02 (M):** No secrets other than the API key are stored, and no account numbers, credentials, or governed personal data are stored (see §10, Constraint C-5).

---

## 7. External interfaces

### 7.1 Anthropic Messages API

| ID | Requirement |
|---|---|
| IF-API-01 | All calls target the Anthropic Messages endpoint from the service worker. |
| IF-API-02 | Requests send `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, and `anthropic-dangerous-direct-browser-access: true` (required for direct browser-context calls). |
| IF-API-03 | Model is `config.model`. Extraction uses `max_tokens` 2048; analysis uses 4096. |
| IF-API-04 | Non-2xx responses raise an error whose detail is surfaced to the operator. |
| IF-API-05 | Model responses are parsed as a bare JSON object; code fences and stray leading/trailing prose are stripped defensively before parsing. |

### 7.2 Extraction output contract

```
{ "skills": [ { "skill": string, "years": number,
                "source": string, "confidence": "high"|"medium"|"low" } ] }
```

### 7.3 Analysis output contract

```
{
  "masthead": {
    "organization": string, "title": string,
    "workModel": "onsite"|"hybrid"|"remote"|"unclear",
    "travel": "none"|"occasional"|"regular"|"percent"|"daily"|"multi-daily"|"unclear",
    "employmentTerms": "permanent"|"contract"|"short-term"|"hourly"|"gig"|"unclear",
    "healthInsurance": "full"|"partial"|"none"|"unclear",
    "payRange": string, "seniority": string, "workAuthorization": string
  },
  "geo": { "verdict": "eligible"|"excluded"|"unclear", "reason": string },
  "skillMatches": [ { "requirement": string, "status": "match"|"partial"|"mismatch",
                      "evidence": string, "reason": string,
                      "confidence": "high"|"medium"|"low" } ],
  "dealbreakers": [ { "requirement": string, "evidence": string, "reason": string } ],
  "skipFlags":   [ { "trigger": string, "evidence": string } ],
  "postingSmell": string,
  "declutteredJD": string
}
```

### 7.4 Internal message protocol (SW ↔ contexts)

| Message | Sender → SW | Response |
|---|---|---|
| `EXTRACT_SKILLS { workHistory }` | Options → SW | `{ ok, data: { skills } }` or `{ ok:false, error }` |
| `ANALYZE_JD { url, pageText }` | Content → SW | `{ ok, data: { analysis } }` or `{ ok:false, error }` |
| `RUN_SCAN` | Popup → Content | `{ ok }`; triggers the content script's scan |

**IF-MSG-01 (M):** the SW keeps the message channel open for the async response.
**IF-MSG-02 (M):** storage reads/writes do not route through the SW; only network operations do.

---

## 8. Non-functional requirements

| ID | Priority | Requirement |
|---|---|---|
| NFR-01 (Security) | M | The API key is stored in `chrome.storage.local` and sent only to the Anthropic endpoint. The options UI states plainly that the key is local to the profile and exposed to anyone with profile access, and that no build should ship with a key embedded. |
| NFR-02 (CSP boundary) | M | All network calls originate in the service worker so that host-page `connect-src` policies cannot block them. Content scripts never call the API directly. |
| NFR-03 (Style isolation) | M | The in-page panel is fully isolated via shadow DOM; no global CSS is injected into host pages. |
| NFR-04 (Cost governance) | M | Analysis is manual and single-call per scan; input is capped (FR-PAGE-02). No background or batch calls occur. |
| NFR-05 (Performance) | S | The panel shows a loading state within ~100 ms of activation; total scan latency is bounded by the single model call. |
| NFR-06 (Resilience) | M | Malformed model output, network failure, missing key, and unsupported-page conditions each produce a handled, human-readable state rather than a silent failure or crash. |
| NFR-07 (Honest geo) | M | Because geo eligibility is a model judgment rather than a computed distance (Assumption A-4), borderline verdicts must include a reason the operator can sanity-check, and confidence should reflect uncertainty. |
| NFR-08 (Portability) | S | Adding a supported site requires only a new match pattern in the manifest content-scripts, with no logic change. |
| NFR-09 (No side effects) | M | JobLens performs no writes to any external system of record and takes no irreversible action on the operator's behalf beyond local storage and clipboard. |

---

## 9. Error handling and edge cases

| ID | Condition | Required behavior |
|---|---|---|
| ERR-01 | No API key at scan time | Panel shows a message directing the operator to set the key in options. No call is made. |
| ERR-02 | Anthropic returns non-2xx | Panel error state shows the status and detail. |
| ERR-03 | Model returns unparseable output | Parse is attempted with fence-stripping and outermost-object extraction; on failure, an error state is shown. |
| ERR-04 | Model returns a valid object with empty sections | Panel renders only populated sections; empty arrays render nothing. |
| ERR-05 | Popup scan on unsupported page | Informational message; no error thrown (FR-SCAN-04). |
| ERR-06 | Posting states no location | `geo.verdict` = `unclear`; masthead work model may be `unclear`. |
| ERR-07 | Page text extraction yields little content | The scan still runs; the model reports fields it cannot determine as `unclear`. |
| ERR-08 | Posting body in a cross-origin iframe | Known limitation; that frame needs its own content-script match added (see Risk R-2). |

---

## 10. Constraints and assumptions

**Constraints**

- **C-1** Manifest V3, Chrome. Service worker background, not a persistent page.
- **C-2** React UI requires a build step; delivered via Vite + CRXJS.
- **C-3** Direct browser API calls require the dangerous-direct-browser-access header (IF-API-02).
- **C-4** Supported sites limited to Built In and ZipRecruiter for MVP.
- **C-5** No storage of credentials (other than the operator's own API key), account numbers, or data barred by the operator's data-governance rules.

**Assumptions**

- **A-1** The operator has an Anthropic API key with sufficient quota.
- **A-2** The operator maintains an accurate profile; matching quality depends on it.
- **A-3** Supported sites render the posting body into the DOM accessible to a content script (not solely inside a cross-origin iframe).
- **A-4** Geo eligibility is derived by the model from ZIP + radius + the posting's stated location using general geographic knowledge; the MVP accepts this in place of deterministic geocoding.
- **A-5** Node 18+ and npm are available to build.

---

## 11. Acceptance criteria — MVP definition of done

The MVP is complete when all of the following hold:

- [x] The extension builds and loads unpacked in Chrome without console errors. *(Build verified 2026-07-13; load-unpacked requires operator Chrome session.)*
- [ ] Options persists all config fields across a browser restart (FR-CFG-*).
- [ ] Extraction returns a reviewable table; unsaved results never affect a scan; edits and manual rows persist on save (FR-EXT-*).
- [ ] On a Built In posting and a ZipRecruiter posting, a manual scan returns a well-formed result conforming to §7.3 (FR-ANL-*).
- [ ] All three Appendix A matching scenarios produce the specified verdicts (FR-MATCH-*).
- [ ] Every skill/dealbreaker/skip flag in a result cites a posting line (FR-ANL-04/05/06, FR-MATCH-06).
- [ ] Geo verdict is present with a checkable reason (FR-ANL-03).
- [ ] The panel renders in isolation on both sites with no style bleed either way (NFR-03).
- [ ] Bookmarking, the bookmarks page, delete, and markdown copy all work (FR-BM-*, FR-EXP-01/02).
- [ ] No scan is ever triggered without an operator gesture (FR-SCAN-06).
- [ ] Missing-key, API-error, and parse-error conditions each show a handled state (ERR-01/02/03).

See also [JobLens_FRS_v0.2_Addendum.md](JobLens_FRS_v0.2_Addendum.md) for multi-board, JSON export, and deterministic geo.

---

## 12. Risks and open questions

| ID | Risk / question | Note |
|---|---|---|
| R-1 | CRXJS + Vite version compatibility | Build glue is the least-verified part; pinned versions may need adjustment, with a hand-written manifest + multi-entry Vite build as fallback. |
| R-2 | Posting bodies inside cross-origin iframes (Workday-style embeds appear on some boards) | May require frame-specific content-script matches; monitor on the two MVP sites. |
| R-3 | Geo precision without geocoding | Borderline radius cases rely on model judgment (A-4, NFR-07); revisit if false exclusions appear. |
| R-4 | Extraction over- or under-claiming | Mitigated by the mandatory review gate (FR-EXT-06); the operator is the backstop. |
| Q-1 | Should the seeded skip triggers ship as defaults or start empty? | Currently seeded (Appendix B); trivially editable. |
| Q-2 | Confidence thresholds for surfacing low-confidence flags | MVP surfaces all with a confidence marker; filtering deferred. |

---

## Appendix A — Matching worked examples

| # | Posting says | Operator holds | Expected verdict | Rule |
|---|---|---|---|---|
| A1 | "Experience with Vue, Angular, or React" | Angular (not Vue/React) | **Match** | FR-MATCH-01 |
| A2 | "Experience with front-end JavaScript frameworks like React" | Angular (not React) | **Match** — the framework category is satisfied; "like React" is illustrative, not a named hard requirement | FR-MATCH-02 |
| A3 | Line 1: "Experience with front-end JavaScript frameworks." Line 2 (standalone): "8+ years of React experience is mandatory." | Vue (not React) | Line 1 **match**; Line 2 **mismatch + dealbreaker**; role gated | FR-MATCH-02 + FR-MATCH-03 + FR-MATCH-04 |

## Appendix B — Seeded skip triggers (editable)

1. Java is a hard requirement.
2. Ruby is the primary language, or the technical assessment is in Ruby.
3. React is a hard requirement with a specific multi-year threshold (e.g. 8+ years React).
4. Security clearance or a federal-contract clearance is required or preferred.
5. Screening is an unannounced live technical deep-dive AI interview.
6. Employer looks like a shell company (registered weeks ago, one officer for every role, hourly pay, no benefits).
7. Posting reads like a PERM labor-certification notice rather than a genuine open role.

## Appendix C — Requirement-to-source traceability

| Area | Source file |
|---|---|
| Domain types + Zod schemas | `src/types/domain.ts`, `src/types/messages.ts` |
| Config shape, storage, bookmarks | `src/lib/storage.ts` |
| Anthropic call, headers, JSON parse | `src/lib/anthropic.ts` |
| Extraction + analysis prompts, matching rules | `src/lib/prompts.ts` |
| Board registry | `src/lib/boards.ts` |
| Deterministic geo | `src/lib/geo.ts` |
| Markdown / JSON export | `src/lib/markdown.ts`, `src/lib/jsonExport.ts` |
| Typed extension messaging | `src/lib/messaging.ts` |
| Message routing, both call flows | `src/background/service-worker.ts` |
| Scan flow, page extraction, panel, bookmark/copy | `src/content/content.tsx`, `src/content/panelStyles.ts` |
| Configuration + extraction review UI | `src/options/options.tsx` |
| Popup menu | `src/popup/popup.tsx` |
| Bookmarks page | `src/bookmarks/bookmarks.tsx` |
| Manifest, permissions, content-script matches | `src/manifest.ts` |
| Build / typecheck | `vite.config.ts`, `tsconfig.json`, `package.json` |
