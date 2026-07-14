import type { Config, DeterministicGeo, WorkHistoryEntry } from '../types/domain';
import { effectiveSkipTriggers } from './storage';

export const EXTRACTION_SYSTEM = `You extract a professional skills inventory from a candidate's work history.

Return a bare JSON object, no prose, no code fences:
{"skills":[{"skill": string, "years": number, "source": string, "confidence": "high"|"medium"|"low"}]}

Rules:
- Only list a skill the text actually supports. Do not invent skills and do not inflate years.
- Scope every claim to what the text says. If a bullet says the person "built the authentication module in Flutter", extract "Flutter (authentication module)", not "Flutter application development". Narrow, evidenced claims only.
- Estimate years from the entry's date range and how central the skill was to that role. When a role ran three years but a skill appears in one project, the years for that skill are less than three. When unsure, estimate low and set confidence to "low" or "medium".
- "source" names the org/title (and bullet if useful) the skill came from.
- Merge the same skill across roles into one entry, summing non-overlapping time, and cite the strongest source.
- Prefer concrete, matchable skill names (languages, frameworks, platforms, domains) over soft skills.
- Keep the JSON compact. Do not add commentary outside the JSON object.`;

export function buildExtractionUser(workHistory: readonly WorkHistoryEntry[]): string {
  const blocks = workHistory
    .map(
      (w, i) =>
        `Entry ${i + 1}\nOrg: ${w.org || ''}\nTitle: ${w.title || ''}\nDates: ${w.start || '?'} to ${w.end || 'present'}\nDescription:\n${w.description || ''}`
    )
    .join('\n\n---\n\n');
  return `Work history:\n\n${blocks}\n\nReturn the skills JSON.`;
}

export const ANALYSIS_SYSTEM = `You analyze ONE job posting against a candidate profile and return a bare JSON object. No prose, no code fences.

Output shape:
{
  "masthead": {
    "organization": string, "title": string,
    "workModel": "onsite"|"hybrid"|"remote"|"unclear",
    "travel": "none"|"occasional"|"regular"|"percent"|"daily"|"multi-daily"|"unclear",
    "employmentTerms": "permanent"|"contract"|"short-term"|"hourly"|"gig"|"unclear",
    "healthInsurance": "full"|"partial"|"none"|"unclear",
    "payRange": string,
    "seniority": string,
    "workAuthorization": string
  },
  "geo": { "verdict": "eligible"|"excluded"|"unclear", "reason": string },
  "skillMatches": [
    { "requirement": string, "status": "match"|"partial"|"mismatch",
      "evidence": string,
      "reason": string, "confidence": "high"|"medium"|"low" }
  ],
  "dealbreakers": [ { "requirement": string, "evidence": string, "reason": string } ],
  "skipFlags":   [ { "trigger": string, "evidence": string } ],
  "postingSmell": string,
  "declutteredJD": string,
  "fit": {
    "label": "Perfect fit"|"Excellent fit"|"Good fit"|"Possible fit"|"Unlikely fit"|"Poor fit",
    "score": 100|95|85|75|60|0,
    "rationale": string
  },
  "apply": { "verdict": "yes"|"maybe"|"no", "rationale": string }
}

Matching logic (follow exactly; the candidate's held skills are ground truth):
1. A requirement offering alternatives ("X or Y or Z") is satisfied if the candidate holds ANY one of them -> match.
2. A GENERIC requirement ("experience with front-end JavaScript frameworks") is satisfied by ANY specific framework the candidate holds. Angular counts for "front-end frameworks" -> match.
3. A requirement naming a SPECIFIC technology the candidate does not hold, stated as a hard threshold ("8+ years of React required"), is a mismatch. If phrased as mandatory, also put it in dealbreakers. A satisfied generic line elsewhere does NOT rescue a specific unmet hard requirement.
4. Never treat holding framework A as holding framework B. Angular experience is not React experience. Only credit skills that appear in the candidate profile (proficiencies or extracted skills). Deficiencies are explicit gaps.
5. Every match/partial/mismatch must quote the exact posting line in "evidence" and give a confidence. Put JobLens analysis in "reason", never in "evidence".
6. Compare the posting's stated education requirements against the candidate's highest education level. If the posting requires a degree level the candidate does not hold (and no equivalent is listed), treat it as a mismatch; if it is a hard gate, also put it in dealbreakers.

Dealbreakers:
- "requirement" must state the FAILED / unmet condition (logically inverted), not the desired criterion.
  Good: "Onsite work location not within configured commute radius"
  Good: "Relocation/travel requirements not compatible with configured commute radius"
  Bad:  "Onsite work location within configured commute radius"
- "reason" = your analysis. "evidence" = verbatim quote from the posting.

Geography:
- onsite/hybrid: eligible if the work location is within radius of ANY of the candidate's locations; otherwise excluded; "unclear" if no location is stated.
- remote: if the posting restricts residency to regions/states/countries, it is eligible only when at least one is in the candidate's work-eligible regions; if it restricts to regions NOT in that list -> excluded. Remote with no stated restriction -> eligible.
- Name the specific constraint and which candidate location/region it was checked against in "reason".
- When a GEO_HINT block is provided (deterministic ZIP distance), prefer its verdict/reason for onsite/hybrid when a posting ZIP was resolved. Still set workModel correctly. For remote roles, ignore GEO_HINT and apply residency rules.

skipFlags: for each provided skip trigger, flag it only if the posting genuinely matches, quoting the line in "evidence".

Fit (locked label↔score pairs — use exactly these):
- Perfect fit = 100, Excellent fit = 95, Good fit = 85, Possible fit = 75, Unlikely fit = 60, Poor fit = 0
Weigh: skill match overall, location/commute/remote eligibility, pay vs signals in profile if any, PERM/skip triggers and authorization language, dealbreakers, and scam/shell postingSmell. Hard geographic or requirement dealbreakers should not land above Unlikely (60). Scam/shell signals → Poor (0).

Apply?:
- "yes" — all hard requirements are met (even if the role is not ideal).
- "maybe" — language introduces ambiguity/uncertainty that is not clearly disqualifying; human review needed.
- "no" — a clear disqualifier exists, or the posting appears to be a scam.
Keep "rationale" short.

declutteredJD: rewrite the posting compressed and skimmable. Operative qualifications first (Required, then Preferred), then core responsibilities. Remove marketing copy, HR/PR platitudes, awards and accolades, and boilerplate. Keep at most a one-line culture note, and only if material. Do not invent anything; use only what the posting states.`;

export type BuildAnalysisUserArgs = {
  profile: Config;
  url: string;
  pageText: string;
  geoHint?: DeterministicGeo | null;
};

export function buildAnalysisUser({
  profile,
  url,
  pageText,
  geoHint = null,
}: BuildAnalysisUserArgs): string {
  const p = profile;
  const extracted = p.extractedSkills
    .map((s) => `${s.skill} (~${s.years}y, ${s.confidence})`)
    .join('; ');
  const locs = p.locations.map((l) => `${l.zip} within ${l.radiusMiles} mi`).join('; ');
  const skipTriggers = effectiveSkipTriggers(p);

  const geoBlock = geoHint
    ? `\nGEO_HINT (deterministic ZIP distance; prefer for onsite/hybrid):\n${JSON.stringify(geoHint, null, 2)}\n`
    : '';

  return `CANDIDATE PROFILE
Education: ${p.education || '(not set)'}
Proficiencies (held, strong): ${p.proficiencies.join(', ') || '(none listed)'}
Extracted skills (held, reviewed): ${extracted || '(none)'}
Known gaps: ${p.deficiencies.join(', ') || '(none listed)'}
Onsite/hybrid locations: ${locs || '(none)'}
Remote work-eligible regions: ${p.workEligibleRegions.join(', ') || '(none)'}
Skip triggers to check:
${skipTriggers.map((t, i) => `  ${i + 1}. ${t}`).join('\n') || '  (none)'}
${geoBlock}
JOB POSTING
URL: ${url}
---
${pageText}
---

Return the analysis JSON.`;
}
