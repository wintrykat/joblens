import type {
  Config,
  DeterministicGeo,
  Preferences,
  SkillClaim,
  WorkHistoryEntry,
} from '../types/domain';
import { DEFAULT_PREFERENCES } from '../types/domain';
import { effectiveSkipTriggers } from './storage';
import {
  EMPLOYMENT_PRIORITY_OPTIONS,
  SKIP_CATEGORY_OPTIONS,
} from './settingsOptions';

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

Evaluation order (follow exactly):
1. Hard gates first (blocked employers, clearance policy, employment floors, enabled skip categories, scam/shell/PERM triggers). On a clear hard-gate hit → Apply "no", add dealbreaker and/or skipFlag, and do not score Fit above Unlikely (60).
2. Skill honesty: treat standing "held" as ground truth for matches; "ramp" as partial with honest framing (not a full match); "never_claim" as mismatch if the posting requires that skill. Prefer JD deliverables over job titles. Preferred qualifications are never dealbreakers.
3. Soft preferences (remote preference, structured-work preference, pipeline load / pay oddity notes) adjust Fit and Apply rationale — they do not alone force Apply "no" unless a hard gate also fires.
4. Then write skillMatches, Fit, Apply, declutteredJD.

Matching logic (candidate skillClaims / held skills are ground truth):
1. A requirement offering alternatives ("X or Y or Z") is satisfied if the candidate HOLDS ANY one of them -> match.
2. A GENERIC requirement ("experience with front-end JavaScript frameworks") is satisfied by ANY specific framework the candidate holds. Angular counts for "front-end frameworks" -> match.
3. A requirement naming a SPECIFIC technology the candidate does not hold, stated as a hard threshold ("8+ years of React required"), is a mismatch. If phrased as mandatory, also put it in dealbreakers. A satisfied generic line elsewhere does NOT rescue a specific unmet hard requirement.
4. Never treat holding framework A as holding framework B. Angular experience is not React experience. Credit only "held" skills (skillClaims standing held, and any legacy extracted skills treated as held). Ramp = partial. Never-claim / known gaps = mismatch when required.
5. Every match/partial/mismatch must quote the exact posting line in "evidence" and give a confidence. Put JobLens analysis in "reason", never in "evidence".
6. Compare the posting's stated education requirements against the candidate's highest education level. If the posting requires a degree level the candidate does not hold (and no equivalent is listed), treat it as a mismatch; if it is a hard gate, also put it in dealbreakers.
7. Global false-negative reminders: preferred ≠ required; title ≠ deliverables; unfamiliar domain alone is not a dealbreaker when skills match.

Dealbreakers:
- "requirement" must state the FAILED / unmet condition (logically inverted), not the desired criterion.
  Good: "Onsite work location not within configured commute radius"
  Good: "Relocation/travel requirements not compatible with configured commute radius"
  Bad:  "Onsite work location within configured commute radius"
- "reason" = your analysis. "evidence" = verbatim quote from the posting.

Geography:
- Empty-list semantics (follow exactly):
  - If remoteOnly is true: onsite and hybrid are hard gates → dealbreaker and Apply "no". Remote roles proceed with residency rules. Empty commute locations are valid when remoteOnly is set.
  - If the candidate's onsite/hybrid locations list is empty / "(none)" and remoteOnly is false: NEVER mark onsite or hybrid geo as "eligible". Use "unclear" and say commute locations are not configured. Do not invent eligibility. Do not add an onsite commute dealbreaker solely because locations are unset.
  - If work-eligible regions is empty / "(none)": treat that as NO residency filter — all remote residency is OK. Do not exclude a remote role for region mismatch against an empty list. Remote with no stated restriction remains eligible.
  - If held skills are "(none)" (no skillClaims held / proficiencies / extracted skills): do not invent skill matches. Prefer status mismatch/partial only where the posting states concrete skills; Fit should stay conservative (Possible fit 75 or Unlikely 60) unless the posting is essentially skill-light. Say the profile has no held skills in Fit rationale when relevant.
- onsite/hybrid (when locations ARE configured and remoteOnly is false): eligible if the work location is within radius of ANY of the candidate's locations; otherwise excluded; "unclear" if no posting location is stated.
- occasionalTravelAllowance (none|weekly|monthly|quarterly|yearly): when not "none", and the posting is primarily remote / light hybrid with onsite visits at most that often (and not daily / multi-day office weeks), do NOT treat outside-radius commute as a hard dealbreaker — note Soft concern in Fit/Apply rationale and keep geo "excluded" or "eligible" with travel nuance in reason. When allowance is "none", outside-radius onsite/hybrid remains a hard gate. Daily or several days/week in office outside radius stays a hard gate regardless of allowance.
- remote (when regions ARE configured): if the posting restricts residency to regions/states/countries, it is eligible only when at least one is in the candidate's work-eligible regions; if it restricts to regions NOT in that list -> excluded. Remote with no stated restriction -> eligible.
- Apply remotePreference as a soft Fit weight (prefer_remote boosts remote-eligible roles; prefer_onsite boosts onsite/hybrid when eligible); never make remotePreference alone force Apply "no". remoteOnly is the hard gate for skipping onsite/hybrid.
- When requireRelocationSubsidyOutsideMetros is true and the posting requires relocation outside the candidate's metro/ZIP radii without subsidy language, flag as a soft concern in Fit rationale (hard dealbreaker only if wording clearly makes relocation mandatory with no support and prefer_onsite/gates demand it).
- Name the specific constraint and which candidate location/region it was checked against in "reason".
- When a GEO_HINT block is provided (deterministic ZIP distance), prefer its verdict/reason for onsite/hybrid when a posting ZIP was resolved. Still set workModel correctly. For remote roles, ignore GEO_HINT and apply residency rules.
- PROFILE_EMPTY_HINTS (when present in the user message) reinforce the empty-list rules above; follow them.

Clearance:
- clearancePolicy "ignore": do not treat clearance language as a gate.
- "flag": if clearance (or preferred clearance when clearanceIncludePreferred) appears, add a skipFlag / note; Apply maybe unless other hard gates fire.
- "skip": clearance language matching the policy → dealbreaker and Apply "no". If clearanceSkipUntil is set and today is before that date, treat required clearance as a skip gate; after that date follow policy normally for "able to obtain" language only if Include preferred is on.
Employment:
- Respect employmentPriority order and minContractMonths when stated (short contracts below the floor → Apply "no" or dealbreaker when clearly stated).

Compensation:
- compensationMode "suspend_floors" (Ignore listed pay): do not gate on min/max dollars.
- "use_floors" (Skip jobs outside my min–max): if pay is clearly outside compensationMinUsd / compensationMaxUsd when those are set, treat as dealbreaker / Apply "no".
- flagSuspiciousComp: if pay looks absurdly high or low vs typical market for the role, note in Fit/Apply rationale only (no live market tool).

Soft signals:
- preferStructuredWork: lightly boost Fit when JD language is structured / high-accountability; never hard-skip the inverse.
- pipelineLoad (how full the seeker's application pipeline is): mention only in Apply rationale as effort context (light/moderate/heavy); do not change Apply verdict from load alone.
- Availability (targetStartDate, availableImmediately, noticePeriodWeeks): if posting start timing clearly conflicts, note in Fit/Apply rationale.

skipFlags: for each provided skip trigger, flag it only if the posting genuinely matches, quoting the line in "evidence".

Fit (locked label↔score pairs — use exactly these):
- Perfect fit = 100, Excellent fit = 95, Good fit = 85, Possible fit = 75, Unlikely fit = 60, Poor fit = 0
Weigh: skill match overall, location/remote preference, pay (when floors active), PERM/skip triggers and authorization language, dealbreakers, soft signals, and scam/shell postingSmell. Hard geographic or requirement dealbreakers should not land above Unlikely (60). Scam/shell signals → Poor (0).
Consistency with Skills / dealbreakers / geo (critical — masthead must match the body):
- Never emit Poor (0) or Apply "no" when dealbreakers is empty, geo is not "excluded", and no scam/shell/PERM/H-1B skipFlags fired. Familiarity-level skill gaps (partial Docker/K8s, etc.) are Soft concerns — not Poor.
- When several Skills rows use status "match", dealbreakers is empty, and geo is eligible/unclear: Fit must be at least Possible (75); prefer Good (85)+ when matches clearly outnumber mismatches. Apply must not be "no" (use "yes" when hard gates are clear; "maybe" only for true ambiguity).
- Fit.rationale and Apply.rationale must agree with the masthead labels: do not praise strong alignment while setting Poor / Apply no.

Apply?:
- "yes" — all hard requirements are met (even if the role is not ideal).
- "maybe" — language introduces ambiguity/uncertainty that is not clearly disqualifying; human review needed.
- "no" — only when a clear hard disqualifier exists (non-empty dealbreakers, geo excluded, clearance skip gate, pay floor fail when use_floors, scam/shell), not for soft skill gaps alone.
Keep "rationale" short.

declutteredJD: rewrite the posting compressed and skimmable. Operative qualifications first (Required, then Preferred), then core responsibilities. Remove marketing copy, HR/PR platitudes, awards and accolades, and boilerplate. Keep at most a one-line culture note, and only if material. Do not invent anything; use only what the posting states.`;

function preferencesPayload(profile: Config): Preferences {
  return profile.preferences ?? DEFAULT_PREFERENCES;
}

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
  const prefs = preferencesPayload(p);
  const claims: SkillClaim[] =
    p.skillClaims.length > 0
      ? p.skillClaims
      : p.proficiencies.map((skill) => ({
          skill,
          standing: 'held' as const,
        }));

  const held = claims.filter((c) => c.standing === 'held');
  const ramp = claims.filter((c) => c.standing === 'ramp');
  const neverClaim = claims.filter((c) => c.standing === 'never_claim');

  const formatClaim = (c: SkillClaim): string => {
    const bits = [c.skill];
    if (c.years != null) bits.push(`~${c.years}y`);
    if (c.lastUsed) bits.push(`last ${c.lastUsed}`);
    if (c.scopeNote) bits.push(c.scopeNote);
    if (c.confidence) bits.push(c.confidence);
    return bits.join(', ');
  };

  const extracted = p.extractedSkills
    .map((s) => `${s.skill} (~${s.years}y, ${s.confidence})`)
    .join('; ');
  const locs = p.locations.map((l) => `${l.zip} within ${l.radiusMiles} mi`).join('; ');
  const skipTriggers = effectiveSkipTriggers(p);

  const employmentLabels = prefs.employmentPriority
    .map((id) => EMPLOYMENT_PRIORITY_OPTIONS.find((o) => o.id === id)?.label || id)
    .join(' > ');

  const enabledSkipCats = SKIP_CATEGORY_OPTIONS.filter(
    (o) => prefs.roleSkipCategories[o.id]
  ).map((o) => o.label);

  const geoBlock = geoHint
    ? `\nGEO_HINT (deterministic ZIP distance; prefer for onsite/hybrid):\n${JSON.stringify(geoHint, null, 2)}\n`
    : '';

  const preferencesBlock = {
    remotePreference: prefs.remotePreference,
    remoteOnly: prefs.remoteOnly,
    occasionalTravelAllowance: prefs.occasionalTravelAllowance,
    requireRelocationSubsidyOutsideMetros: prefs.requireRelocationSubsidyOutsideMetros,
    employmentPriority: prefs.employmentPriority,
    employmentPriorityLabels: employmentLabels || null,
    minContractMonths: prefs.minContractMonths,
    clearancePolicy: prefs.clearancePolicy,
    clearanceIncludePreferred: prefs.clearanceIncludePreferred,
    clearanceSkipUntil: prefs.clearanceSkipUntil || null,
    blockedEmployers: prefs.blockedEmployers,
    roleSkipCategoriesEnabled: enabledSkipCats,
    flagShellEmployers: prefs.flagShellEmployers,
    flagPermNotices: prefs.flagPermNotices,
    compensationMode: prefs.compensationMode,
    compensationMinUsd: prefs.compensationMinUsd,
    compensationMaxUsd: prefs.compensationMaxUsd,
    flagSuspiciousComp: prefs.flagSuspiciousComp,
    preferStructuredWork: prefs.preferStructuredWork,
    pipelineLoad: prefs.pipelineLoad,
    targetStartDate: prefs.targetStartDate || null,
    availableImmediately: prefs.availableImmediately,
    noticePeriodWeeks: prefs.noticePeriodWeeks,
    workAuthorizationNote: p.workAuthorizationNote || null,
  };

  const emptyHints: string[] = [];
  if (prefs.remoteOnly) {
    emptyHints.push(
      'remoteOnly: onsite/hybrid are hard gates (dealbreaker + Apply no); empty commute locations are OK'
    );
  } else if (!locs) {
    emptyHints.push(
      'locations empty: never mark onsite/hybrid geo eligible; use unclear; do not invent commute eligibility or an onsite dealbreaker solely from unset locations'
    );
  }
  if (p.workEligibleRegions.length === 0) {
    emptyHints.push(
      'work-eligible regions empty: no residency filter — do not exclude remote roles for region mismatch'
    );
  }
  if (held.length === 0 && !p.proficiencies.length) {
    emptyHints.push(
      'held skills empty: do not invent skill matches; keep Fit conservative (Possible/Unlikely) unless the posting is skill-light'
    );
  }
  const emptyHintsBlock =
    emptyHints.length > 0
      ? `\nPROFILE_EMPTY_HINTS\n${emptyHints.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}\n`
      : '';

  return `CANDIDATE PROFILE
Education: ${p.education || '(not set)'}
Work authorization note: ${p.workAuthorizationNote || '(none)'}
Held skills: ${held.map(formatClaim).join('; ') || p.proficiencies.join(', ') || '(none)'}
Ramp skills (partial only): ${ramp.map(formatClaim).join('; ') || '(none)'}
Never-claim skills: ${neverClaim.map(formatClaim).join('; ') || '(none)'}
${extracted ? `Legacy extracted skills (treat as held if not already listed): ${extracted}\n` : ''}Known gaps: ${p.deficiencies.join(', ') || '(none listed)'}
Onsite/hybrid locations: ${locs || '(none)'}
Remote work-eligible regions: ${p.workEligibleRegions.join(', ') || '(none)'}
Skip triggers to check:
${skipTriggers.map((t, i) => `  ${i + 1}. ${t}`).join('\n') || '  (none)'}
${emptyHintsBlock}
PREFERENCES
${JSON.stringify(preferencesBlock, null, 2)}
${geoBlock}
JOB POSTING
URL: ${url}
---
${pageText}
---

Return the analysis JSON.`;
}

export const CONFIG_PROPOSE_SYSTEM = `You map resumes, notes, and job-search instructions into JobLens configuration proposals.

Return a bare JSON object, no prose, no code fences:
{
  "summary": string,
  "changes": [
    {
      "id": string,
      "path": string,
      "label": string,
      "rationale": string,
      "value": unknown
    }
  ]
}

Rules:
- Only propose paths from this allowlist: education, workAuthorizationNote, locations, workEligibleRegions, skillClaims, deficiencies, skipTriggers, workHistory, preferences.remoteOnly, preferences.remotePreference, preferences.occasionalTravelAllowance, preferences.requireRelocationSubsidyOutsideMetros, preferences.employmentPriority, preferences.minContractMonths, preferences.clearancePolicy, preferences.clearanceIncludePreferred, preferences.clearanceSkipUntil, preferences.blockedEmployers, preferences.roleSkipCategories, preferences.flagShellEmployers, preferences.flagPermNotices, preferences.compensationMode, preferences.compensationMinUsd, preferences.compensationMaxUsd, preferences.flagSuspiciousComp, preferences.preferStructuredWork, preferences.pipelineLoad, preferences.targetStartDate, preferences.availableImmediately, preferences.noticePeriodWeeks.
- Never propose apiKey, model, theme, bookmarks, roleFamilies, extractedSkills, or preflightMode.
- Never invent ZIP codes. Only include locations when the text clearly states a postal code or unambiguous home metro with a real US ZIP.
- skillClaims: array of { skill, standing: "held"|"ramp"|"never_claim", years?, lastUsed?, scopeNote?, confidence? }. Prefer held only when evidenced; use ramp/never_claim when the seeker says so. This is the single skills list.
- workHistory entries: { org, title, start, end, description }. Stay conservative.
- employmentPriority ids (ordered): permanent | contract_to_hire | long_contract | short_contract | part_time.
- remoteOnly: true only when the seeker clearly wants remote-only / will not do onsite or hybrid.
- Do not invent salary floors or compensation min/max unless explicitly stated.
- Each change needs a stable unique id, a short human label, and a one-line rationale.
- Prefer fewer high-confidence changes over speculative ones. Skip fields already matching CURRENT_CONFIG.
- Array values should be the proposed items to MERGE (not a full wipe), except employmentPriority which is the full ordered list when proposed.`;

export function buildConfigProposeUser(args: {
  documentText: string;
  truncated: boolean;
  currentConfigJson: string;
}): string {
  return `CURRENT_CONFIG (apiKey omitted):
${args.currentConfigJson}

DOCUMENTS${args.truncated ? ' (truncated for length)' : ''}:
---
${args.documentText}
---

Return the proposal JSON.`;
}

export const PREFLIGHT_SYSTEM = `You perform a LIGHT hard-gate preflight on ONE job posting. Return bare JSON only (no prose, no fences).

Output shape:
{
  "verdict": "clear" | "soft" | "hard_skip" | "unknown",
  "reasons": string[],
  "workModel": "onsite" | "hybrid" | "remote" | "unclear",
  "organization": string,
  "geoNote": string,
  "flags": string[]
}

Rules:
- Only decide hard gates from HARD_GATES below. Do NOT score Fit, skills, or Apply.
- Prefer false negatives: if unsure → "unknown" or "soft", never invent a hard_skip.
- hard_skip only when evidence is clear for a listed hard gate (blocked employer, remoteOnly vs onsite/hybrid, clearance skip policy, enabled skip categories, PERM/shell when those flags are on, or obvious commute geo exclude for onsite/hybrid).
- soft = possible concern but not definitive.
- clear = no hard-gate hits found in the text provided.
- flags: short machine ids when relevant (e.g. blocked_employer, remote_only, clearance, perm, shell, geo_excluded, skip_category, residency_excluded).
- Keep reasons to 1–3 short human-readable strings (never camelCase config field names). Prefer wording like "Your remote residency is limited to TX, PA" not "workEligibleRegions…".
- organization: best guess company name if present, else "".

Geography / residency (critical — follow exactly):
- Commute locations (when configured) apply to onsite/hybrid only. Do not hard_skip a remote role because the employer's listed city/HQ is outside commute ZIPs.
- candidateRemoteResidency.regions = where the CANDIDATE may live/work FROM for remote roles. Empty regions list = no residency filter (all remote OK).
- For remote roles: hard_skip for residency ONLY if the posting EXPLICITLY restricts employee residency/work location to a set of regions/states/countries and NONE of those intersect the candidate's list.
- INVERTED exclusions: "not accepting applicants from CA, IL, NY" / "cannot be considered" means those states are FORBIDDEN — candidates in other states (e.g. TX, PA) are permitted. Do NOT hard_skip when the candidate's regions are outside the excluded list.
- Never treat a city/state that appears only inside an exclusion sentence as the job's work location (e.g. "New York" in "not accepting … New York" is not the posting site).
- Remote + "nationwide", "open to all US", "no [state] residency required", or no residency restriction → clear for residency (even if HQ/city is listed).
- Listing a city next to Remote (e.g. "Madison, WI · Remote" or "Ferndale, WA · Remote") is NOT a residency restriction by itself.
- Short mandatory onsite training (e.g. "2 weeks onsite") with Remote-primary work → Soft under occasionalTravelAllowance when configured; not a commute hard_skip.`;

export function buildPreflightUser(args: {
  hardGatesJson: string;
  url: string;
  pageText: string;
  localHintJson?: string;
}): string {
  const local = args.localHintJson
    ? `\nLOCAL_PREFLIGHT (deterministic; do not clear a hard_skip):\n${args.localHintJson}\n`
    : '';
  return `HARD_GATES:
${args.hardGatesJson}
${local}
URL: ${args.url}

JOB POSTING (truncated for preflight):
---
${args.pageText}
---

Return the preflight JSON.`;
}

export function buildPreflightHardGates(profile: Config): Record<string, unknown> {
  const prefs = profile.preferences ?? DEFAULT_PREFERENCES;
  const enabledSkips = Object.entries(prefs.roleSkipCategories)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const regions = (profile.workEligibleRegions ?? []).map((r) => r.trim()).filter(Boolean);
  return {
    remoteOnly: prefs.remoteOnly,
    occasionalTravelAllowance: prefs.occasionalTravelAllowance,
    blockedEmployers: prefs.blockedEmployers.filter((e) => e.trim().length >= 2),
    clearancePolicy: prefs.clearancePolicy,
    clearanceIncludePreferred: prefs.clearanceIncludePreferred,
    clearanceSkipUntil: prefs.clearanceSkipUntil || null,
    roleSkipCategories: enabledSkips,
    flagShellEmployers: prefs.flagShellEmployers,
    flagPermNotices: prefs.flagPermNotices || profile.flagPermNotices,
    commuteLocationsConfigured: (profile.locations ?? []).length > 0,
    candidateRemoteResidency: {
      regions,
      emptyMeansNoFilter: regions.length === 0,
      rule:
        'For remote jobs, hard_skip only when the posting explicitly restricts worker residency such that NONE of the candidate regions are allowed. Inverted lists ("not accepting CA, IL, NY") PERMIT other states. Nationwide / no residency required → do not hard_skip. Do not treat cities named only in exclusion sentences as the job site.',
    },
    occasionalTravelRule:
      prefs.occasionalTravelAllowance === 'none'
        ? 'No outside-radius travel exception; hybrid/onsite outside commute ZIPs → hard_skip.'
        : `Allow Soft (not hard_skip) for primarily remote / light hybrid with onsite visits up to ${prefs.occasionalTravelAllowance}. Daily/multi-day office weeks outside radius remain hard_skip.`,
  };
}


