# JobLens

AI-assisted job-posting triage as a personal Chrome extension (Manifest V3). You run a manual scan on a posting; Claude returns a structured triage panel. No auto-scan, no bulk scraping.

## Features

- **Side panel UI** — results sit in Chrome’s native, resizable side panel (toolbar click or in-page Scan).
- **Masthead** — org, title, work model, travel, terms, health, pay, seniority, authorization.
- **Fit & Apply?** — banded fit score plus Yes / Maybe / No apply guidance (with deterministic floors for geo/dealbreakers).
- **Skill match/mismatch** — each flag cites the posting line, with confidence.
- **Dealbreakers** — unmet hard requirements, titles phrased as failures.
- **Skip triggers** — editable list, plus optional PERM-notice flag.
- **Geo** — onsite/hybrid uses deterministic US ZIP haversine when a ZIP/city can be resolved; remote uses work-eligible regions.
- **Decluttered JD**, **bookmark**, **copy markdown / JSON** (`joblens.triage/v1`).
- **Appearance** — Default (Chrome/system), Light, or Dark.

## Supported boards

Built In, ZipRecruiter, Indeed, LinkedIn Jobs, Greenhouse, Lever, Ashby, Workday, Dice, Remotive, We Work Remotely, Monster, Himalayas, WorkInTexas, Wellfound, CAPPS, Robert Half, CyberCoders, USPS, Apple, Google, Meta, Microsoft, Hacker News / YC Jobs.

The launcher appears on **posting URLs** (not search lists). Add boards in [`src/lib/boards.ts`](src/lib/boards.ts).

## Requirements

- Node 18+
- Chrome (MV3)
- Your own [Anthropic API key](https://console.anthropic.com/)

## Setup

```bash
npm install
npm run build       # typecheck + Vite → dist/
npm run smoke       # build + board/geo/JSON checks
```

Load unpacked:

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → select `dist/`

Optional pack:

```bash
npm run pack        # → release/joblens-<version>.crx + .zip
```

Signing uses a local key at `keys/joblens.pem` (created on first pack, **not** in git). See [`keys/README.md`](keys/README.md).

## Configure

1. Toolbar → JobLens side panel → **Options** (or open the options page).
2. Paste your Anthropic API key (stored in `chrome.storage.local`, sent only to Anthropic).
3. Fill education, skills, locations (ZIP + radius), work-eligible regions, skip triggers, work history.
4. Extract skills from history, **review**, then **Save**.

Do not commit API keys, `.pem` files, or packed `.crx` builds.

## Develop

```bash
npm run typecheck
npm run dev         # HMR; still use Load unpacked from dist/ for full extension tests
```

Stack: TypeScript (strict) + React + Zod + Vite + CRXJS.

## How this was built (and what that implies)

JobLens was **vibe coded with [Cursor](https://cursor.com)** — an AI coding agent drove most of the implementation from product intent, with a human steering goals and spot-checking behavior. Treat it as a useful personal tool, not a polished, fully audited product.

**Implications to assume:**

- **Coverage is uneven.** There are smoke checks for boards, geo, and JSON shape, not a full unit/E2E suite. Board URL matchers and DOM extractors can break when sites redesign without anyone noticing immediately.
- **AI judgment is fallible.** Fit / Apply / skill match / dealbreakers come from the model plus a few deterministic floors. Wrong or overconfident triage will happen; the human still decides whether to apply.
- **Security was reviewed lightly, not as a formal audit.** Do not reuse this pattern for multi-user, enterprise, or high-stakes credential handling without your own review. The API key lives in extension storage by design.
- **Prompt and schema drift.** Prompt text, Zod shapes, and Claude model behavior can interact badly after upgrades; expect occasional parse errors or odd ratings until prompts are retuned.
- **History was reset for public release.** Prefer reading the current tree and docs over archaeology; there is little curated commit narrative.

If something looks wrong, distrust the panel and open an issue — or fork and harden the path you care about.

## Security

See [SECURITY.md](SECURITY.md). Report issues privately if they involve credential leakage. Given the AI-assisted origin, treat any security report as more likely than for a traditionally reviewed codebase.

## License

MIT — see [LICENSE](LICENSE).
