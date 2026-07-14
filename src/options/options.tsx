import { useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfig, setConfig } from '../lib/storage';
import { extractSkills, proposeConfigFromDocs } from '../lib/messaging';
import {
  applyConfigProposalChanges,
  extractTextsFromFiles,
  type ConfigProposal,
  type ConfigProposalChange,
} from '../lib/docImport';
import {
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  EDUCATION_LEVELS,
  EMPLOYMENT_PRIORITY_OPTIONS,
  SKIP_CATEGORY_OPTIONS,
} from '../lib/settingsOptions';
import type {
  ClearancePolicy,
  CompensationMode,
  Config,
  EmploymentPriority,
  Location,
  PipelineLoad,
  Preferences,
  RemotePreference,
  SkillClaim,
  SkillStanding,
  ThemePreference,
  WorkHistoryEntry,
} from '../types/domain';
import { DEFAULT_PREFERENCES, DEFAULT_ROLE_SKIP_CATEGORIES } from '../types/domain';
import { watchThemeFromConfig, applyTheme } from '../lib/theme';
import './options.css';

type OptionsTab = 'basics' | 'geography' | 'skills' | 'preferences';

const TABS: Array<{ id: OptionsTab; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'geography', label: 'Geography' },
  { id: 'skills', label: 'Skills & history' },
  { id: 'preferences', label: 'Preferences' },
];

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: 'default', label: 'Default (follow Chrome / system)' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const parseLines = (s: string): string[] =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

function syncProficienciesFromClaims(claims: SkillClaim[]): string[] {
  return claims.filter((c) => c.standing === 'held' && c.skill.trim()).map((c) => c.skill.trim());
}

function Options(): JSX.Element {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [status, setStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deficienciesText, setDeficienciesText] = useState('');
  const [skipTriggersText, setSkipTriggersText] = useState('');
  const [blockedEmployersText, setBlockedEmployersText] = useState('');
  const [activeTab, setActiveTab] = useState<OptionsTab>('basics');
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<ConfigProposal | null>(null);
  const [selectedChangeIds, setSelectedChangeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void getConfig().then((c) => {
      setCfg(c);
      setDeficienciesText(c.deficiencies.join('\n'));
      setSkipTriggersText(c.skipTriggers.join('\n'));
      setBlockedEmployersText((c.preferences?.blockedEmployers ?? []).join('\n'));
      setDirty(false);
    });
  }, []);

  useEffect(() => watchThemeFromConfig(), []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!cfg) return <div className="wrap">Loading…</div>;

  const prefs: Preferences = cfg.preferences ?? DEFAULT_PREFERENCES;
  const markDirty = (): void => setDirty(true);

  const patch = (p: Partial<Config>): void => {
    setCfg({ ...cfg, ...p });
    if (p.theme) applyTheme(p.theme);
    markDirty();
  };

  const patchPrefs = (p: Partial<Preferences>): void => {
    const nextPrefs = { ...prefs, ...p };
    patch({
      preferences: nextPrefs,
      ...(typeof p.flagPermNotices === 'boolean'
        ? { flagPermNotices: p.flagPermNotices }
        : {}),
    });
  };

  const modelIds = new Set(CLAUDE_MODELS.map((m) => m.id));
  const modelValue = modelIds.has(cfg.model) ? cfg.model : DEFAULT_CLAUDE_MODEL;
  const educationKnown = EDUCATION_LEVELS.includes(cfg.education);

  const addJob = (): void =>
    patch({
      workHistory: [
        ...cfg.workHistory,
        { org: '', title: '', start: '', end: '', description: '' },
      ],
    });

  const setJob = <K extends keyof WorkHistoryEntry>(
    i: number,
    k: K,
    v: WorkHistoryEntry[K]
  ): void => {
    const wh = cfg.workHistory.slice();
    const current = wh[i];
    if (!current) return;
    wh[i] = { ...current, [k]: v };
    patch({ workHistory: wh });
  };

  const rmJob = (i: number): void =>
    patch({ workHistory: cfg.workHistory.filter((_, j) => j !== i) });

  const addLoc = (): void =>
    patch({ locations: [...cfg.locations, { zip: '', radiusMiles: 25 }] });

  const setLoc = <K extends keyof Location>(i: number, k: K, v: Location[K]): void => {
    const l = cfg.locations.slice();
    const current = l[i];
    if (!current) return;
    l[i] = { ...current, [k]: v };
    patch({ locations: l });
  };

  const rmLoc = (i: number): void =>
    patch({ locations: cfg.locations.filter((_, j) => j !== i) });

  const setClaim = <K extends keyof SkillClaim>(i: number, k: K, v: SkillClaim[K]): void => {
    const rows = cfg.skillClaims.slice();
    const current = rows[i];
    if (!current) return;
    rows[i] = { ...current, [k]: v };
    patch({ skillClaims: rows, proficiencies: syncProficienciesFromClaims(rows) });
  };

  const rmClaim = (i: number): void => {
    const rows = cfg.skillClaims.filter((_, j) => j !== i);
    patch({ skillClaims: rows, proficiencies: syncProficienciesFromClaims(rows) });
  };

  const addClaim = (): void => {
    const rows = [
      ...cfg.skillClaims,
      { skill: '', standing: 'held' as const, years: undefined, lastUsed: '', scopeNote: '' },
    ];
    patch({ skillClaims: rows });
  };

  const toggleEmploymentPriority = (id: EmploymentPriority): void => {
    const list = prefs.employmentPriority.slice();
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(id);
    patchPrefs({ employmentPriority: list });
  };

  const moveEmployment = (id: EmploymentPriority, dir: -1 | 1): void => {
    const list = prefs.employmentPriority.slice();
    const idx = list.indexOf(id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= list.length) return;
    const a = list[idx]!;
    const b = list[next]!;
    list[idx] = b;
    list[next] = a;
    patchPrefs({ employmentPriority: list });
  };

  const runExtract = async (): Promise<void> => {
    setExtracting(true);
    setStatus('Extracting skills from work history…');
    const res = await extractSkills({ workHistory: cfg.workHistory });
    setExtracting(false);
    if (!res.ok) {
      setStatus('Extraction failed: ' + res.error);
      return;
    }

    const claimKeys = new Set(cfg.skillClaims.map((c) => c.skill.toLowerCase()));
    const claimAdds: SkillClaim[] = res.data.skills
      .filter((s) => s.skill && !claimKeys.has(s.skill.toLowerCase()))
      .map((s) => ({
        skill: s.skill,
        standing: 'held' as const,
        years: s.years,
        confidence: s.confidence,
        scopeNote: s.source,
      }));
    const skillClaims = [...cfg.skillClaims, ...claimAdds];

    patch({
      skillClaims,
      proficiencies: syncProficienciesFromClaims(skillClaims),
    });
    setStatus(
      `Merged ${claimAdds.length} new skill(s) from history (${res.data.skills.length} found). Review standings below, then Save.`
    );
  };

  const syncTextsFromConfig = (c: Config): void => {
    setDeficienciesText(c.deficiencies.join('\n'));
    setSkipTriggersText(c.skipTriggers.join('\n'));
    setBlockedEmployersText((c.preferences?.blockedEmployers ?? []).join('\n'));
  };

  const runProposeFromDocs = async (): Promise<void> => {
    if (!docFiles.length) {
      setStatus('Choose one or more .txt, .md, .pdf, or .docx files first.');
      return;
    }
    setProposing(true);
    setStatus('Extracting text from documents…');
    try {
      const bundle = await extractTextsFromFiles(docFiles);
      setStatus(
        bundle.truncated
          ? 'Text truncated to limit; proposing config changes…'
          : 'Proposing config changes…'
      );
      const res = await proposeConfigFromDocs({
        documentText: bundle.text,
        truncated: bundle.truncated,
      });
      if (!res.ok) {
        setStatus('Propose failed: ' + res.error);
        setProposing(false);
        return;
      }
      const nextProposal: ConfigProposal = {
        summary: res.data.summary || '',
        changes: res.data.changes as ConfigProposalChange[],
      };
      setProposal(nextProposal);
      setSelectedChangeIds(new Set(nextProposal.changes.map((c) => c.id)));
      setStatus(
        nextProposal.changes.length
          ? `Proposed ${nextProposal.changes.length} change(s). Review and apply, then Save.`
          : 'No changes proposed from those documents.'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('Import failed: ' + message);
    }
    setProposing(false);
  };

  const toggleChangeSelected = (id: string): void => {
    setSelectedChangeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySelectedProposal = (): void => {
    if (!proposal) return;
    const selected = proposal.changes.filter((c) => selectedChangeIds.has(c.id));
    if (!selected.length) {
      setStatus('Select at least one change to apply.');
      return;
    }
    const next = applyConfigProposalChanges(cfg, selected);
    setCfg(next);
    syncTextsFromConfig(next);
    markDirty();
    setProposal(null);
    setSelectedChangeIds(new Set());
    setStatus(`Applied ${selected.length} change(s). Review drafts, then Save.`);
  };

  const discardProposal = (): void => {
    setProposal(null);
    setSelectedChangeIds(new Set());
    setStatus('Proposal discarded.');
  };

  const save = async (): Promise<void> => {
    const skillClaims = cfg.skillClaims.filter((c) => c.skill.trim());
    const blockedEmployers = parseLines(blockedEmployersText);
    const toSave: Config = {
      ...cfg,
      model: modelValue,
      deficiencies: parseLines(deficienciesText),
      skipTriggers: parseLines(skipTriggersText),
      skillClaims,
      proficiencies: syncProficienciesFromClaims(skillClaims),
      preferences: {
        ...prefs,
        blockedEmployers,
      },
      flagPermNotices: prefs.flagPermNotices,
    };
    await setConfig(toSave);
    setCfg(toSave);
    setDeficienciesText(toSave.deficiencies.join('\n'));
    setSkipTriggersText(toSave.skipTriggers.join('\n'));
    setBlockedEmployersText(toSave.preferences.blockedEmployers.join('\n'));
    setDirty(false);
    setStatus('Saved.');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="wrap">
      <h1>JobLens settings</h1>

      <section className="import-box">
        <h2>Import documents</h2>
        <p className="note">
          Upload resumes or notes (.txt, .md, .pdf, .docx). JobLens proposes config changes; you
          review and apply into the draft, then Save.
        </p>
        <label>
          Files
          <input
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx"
            onChange={(e) => setDocFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {docFiles.length ? (
          <p className="note">
            Selected: {docFiles.map((f) => f.name).join(', ')}
          </p>
        ) : null}
        <button
          className="primary"
          type="button"
          onClick={() => void runProposeFromDocs()}
          disabled={proposing || !docFiles.length}
        >
          {proposing ? 'Proposing…' : 'Propose from documents'}
        </button>

        {proposal ? (
          <div className="proposal">
            {proposal.summary ? <p className="proposal-summary">{proposal.summary}</p> : null}
            {proposal.changes.length === 0 ? (
              <p className="note">No changes in this proposal.</p>
            ) : (
              <ul className="proposal-list">
                {proposal.changes.map((change) => (
                  <li key={change.id}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={selectedChangeIds.has(change.id)}
                        onChange={() => toggleChangeSelected(change.id)}
                      />
                      <span>
                        <strong>{change.label}</strong>
                        {change.rationale ? (
                          <span className="hint"> — {change.rationale}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" type="button" onClick={applySelectedProposal}>
                Apply selected
              </button>
              <button className="rm" type="button" onClick={discardProposal}>
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'basics' ? (
        <>
          <section>
            <h2>Basics</h2>
            <label>
              Anthropic API key
              <input
                type="password"
                value={cfg.apiKey}
                onChange={(e) => patch({ apiKey: e.target.value })}
                placeholder="sk-ant-…"
              />
            </label>
            <p className="note">
              Stored only in this browser profile and sent directly to the Anthropic API. Anyone with
              access to the profile can read it — use a dedicated key with limits.
            </p>
            <label>
              Model
              <select value={modelValue} onChange={(e) => patch({ model: e.target.value })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.id})
                  </option>
                ))}
              </select>
            </label>
            {!modelIds.has(cfg.model) && cfg.model ? (
              <p className="note">
                Previous model <code>{cfg.model}</code> is not in the current list; Sonnet 5 is
                selected. Save to persist.
              </p>
            ) : null}
            <label>
              Theme
              <select
                value={cfg.theme || 'default'}
                onChange={(e) => patch({ theme: e.target.value as ThemePreference })}
              >
                {THEME_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section>
            <h2>Identity for matching</h2>
            <p className="note">
              No name or identity fields are required for triage. Add only what changes matching.
            </p>
            <label>
              Highest education
              <select
                value={educationKnown ? cfg.education : ''}
                onChange={(e) => patch({ education: e.target.value })}
              >
                <option value="">— Not set —</option>
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            {!educationKnown && cfg.education ? (
              <p className="note">
                Custom value on file: <em>{cfg.education}</em>. Choose a list item to replace it.
              </p>
            ) : null}
            <label>
              Work authorization note (optional)
              <textarea
                rows={2}
                value={cfg.workAuthorizationNote || ''}
                onChange={(e) => patch({ workAuthorizationNote: e.target.value })}
                placeholder="e.g. US citizen, no sponsorship needed"
              />
            </label>
            <div className="row">
              <label style={{ flex: 1 }}>
                Target start date
                <input
                  type="date"
                  value={prefs.targetStartDate || ''}
                  onChange={(e) => patchPrefs({ targetStartDate: e.target.value })}
                />
              </label>
              <label style={{ flex: 1 }}>
                Notice period (weeks)
                <input
                  type="number"
                  min={0}
                  value={prefs.noticePeriodWeeks ?? ''}
                  onChange={(e) =>
                    patchPrefs({
                      noticePeriodWeeks: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.availableImmediately}
                onChange={(e) => patchPrefs({ availableImmediately: e.target.checked })}
              />
              <span>Available immediately</span>
            </label>
          </section>
        </>
      ) : null}

      {activeTab === 'geography' ? (
        <section>
          <h2>Geography</h2>
          <p className="note">
            Required for Scan — set at least one of: a commute ZIP, remote-eligible regions, or
            Remote only. Without geography intent, scanning is blocked.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.remoteOnly}
              onChange={(e) => patchPrefs({ remoteOnly: e.target.checked })}
            />
            <span>Remote only — skip onsite and hybrid roles</span>
          </label>
          {prefs.remoteOnly ? (
            <p className="note">
              ZIP radii are optional while Remote only is on (useful if you later uncheck). Regions
              still help with residency-restricted remote postings.
            </p>
          ) : (
            <p className="note">Add each ZIP you&apos;d commute to for onsite/hybrid checks.</p>
          )}
          {cfg.locations.map((l, i) => (
            <div className="row" key={i}>
              <input
                placeholder="ZIP"
                value={l.zip}
                onChange={(e) => setLoc(i, 'zip', e.target.value)}
                style={{ maxWidth: 120 }}
              />
              <input
                type="number"
                placeholder="miles"
                value={l.radiusMiles}
                onChange={(e) => setLoc(i, 'radiusMiles', Number(e.target.value))}
                style={{ maxWidth: 100 }}
              />
              <button className="rm" type="button" onClick={() => rmLoc(i)}>
                remove
              </button>
            </div>
          ))}
          <button className="add" type="button" onClick={addLoc}>
            + location
          </button>
          <label>
            Remote work-eligible regions (comma separated, e.g. TX, PA)
            <input
              value={cfg.workEligibleRegions.join(', ')}
              onChange={(e) =>
                patch({
                  workEligibleRegions: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <details className="advanced">
            <summary>Advanced</summary>
            <label>
              Remote preference
              <select
                value={prefs.remotePreference}
                onChange={(e) =>
                  patchPrefs({ remotePreference: e.target.value as RemotePreference })
                }
              >
                <option value="prefer_remote">Prefer remote</option>
                <option value="neutral">Neutral</option>
                <option value="prefer_onsite">Prefer onsite / hybrid</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.requireRelocationSubsidyOutsideMetros}
                onChange={(e) =>
                  patchPrefs({ requireRelocationSubsidyOutsideMetros: e.target.checked })
                }
              />
              <span>Flag relocation required outside my metros without subsidy language</span>
            </label>
          </details>
        </section>
      ) : null}

      {activeTab === 'skills' ? (
        <>
          <section>
            <h2>Skills</h2>
            <p className="note">
              Strongly recommended for reliable Fit/Apply. One list: Held = ground truth for matches;
              Ramp = partial; Never-claim = mismatch if required. Extract from history merges new
              skills in as held — review standings before Save.
            </p>
            <table className="skills">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Standing</th>
                  <th>Years</th>
                  <th>Last used</th>
                  <th>Scope</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cfg.skillClaims.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={c.skill}
                        onChange={(e) => setClaim(i, 'skill', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={c.standing}
                        onChange={(e) =>
                          setClaim(i, 'standing', e.target.value as SkillStanding)
                        }
                      >
                        <option value="held">held</option>
                        <option value="ramp">ramp</option>
                        <option value="never_claim">never-claim</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={c.years ?? ''}
                        onChange={(e) =>
                          setClaim(
                            i,
                            'years',
                            e.target.value === '' ? undefined : Number(e.target.value)
                          )
                        }
                        style={{ maxWidth: 70 }}
                      />
                    </td>
                    <td>
                      <input
                        value={c.lastUsed || ''}
                        onChange={(e) => setClaim(i, 'lastUsed', e.target.value)}
                        placeholder="YYYY"
                        style={{ maxWidth: 80 }}
                      />
                    </td>
                    <td>
                      <input
                        value={c.scopeNote || ''}
                        onChange={(e) => setClaim(i, 'scopeNote', e.target.value)}
                        placeholder="auth module only"
                      />
                    </td>
                    <td>
                      <button className="rm" type="button" onClick={() => rmClaim(i)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add" type="button" onClick={addClaim}>
              + skill claim
            </button>
            <label style={{ marginTop: 14 }}>
              Known gaps (one per line — quick list; prefer standing above when possible)
              <textarea
                rows={3}
                value={deficienciesText}
                onChange={(e) => {
                  setDeficienciesText(e.target.value);
                  markDirty();
                }}
                placeholder={'Kubernetes\nRuby'}
              />
            </label>
          </section>

          <section>
            <h2>Work history</h2>
            {cfg.workHistory.map((w, i) => (
              <div className="job" key={i}>
                <div className="row">
                  <input
                    placeholder="Org"
                    value={w.org}
                    onChange={(e) => setJob(i, 'org', e.target.value)}
                  />
                  <input
                    placeholder="Title"
                    value={w.title}
                    onChange={(e) => setJob(i, 'title', e.target.value)}
                  />
                </div>
                <div className="row">
                  <input
                    placeholder="Start YYYY-MM"
                    value={w.start}
                    onChange={(e) => setJob(i, 'start', e.target.value)}
                    style={{ maxWidth: 150 }}
                  />
                  <input
                    placeholder="End YYYY-MM or present"
                    value={w.end}
                    onChange={(e) => setJob(i, 'end', e.target.value)}
                    style={{ maxWidth: 200 }}
                  />
                  <button className="rm" type="button" onClick={() => rmJob(i)}>
                    remove
                  </button>
                </div>
                <textarea
                  rows={4}
                  placeholder="What you did — activities, technologies, scope"
                  value={w.description}
                  onChange={(e) => setJob(i, 'description', e.target.value)}
                />
              </div>
            ))}
            <button className="add" type="button" onClick={addJob}>
              + job
            </button>
            <div style={{ marginTop: 12 }}>
              <button
                className="primary"
                type="button"
                onClick={() => void runExtract()}
                disabled={extracting}
              >
                {extracting ? 'Extracting…' : 'Extract skills from history'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'preferences' ? (
        <section>
          <h2>Preferences</h2>
          <p className="note" style={{ marginTop: 0 }}>
            Employment priority (check to include; use arrows to rank).
          </p>
          {EMPLOYMENT_PRIORITY_OPTIONS.map((opt) => {
            const included = prefs.employmentPriority.includes(opt.id);
            const rank = included ? prefs.employmentPriority.indexOf(opt.id) + 1 : null;
            return (
              <div className="prio-row" key={opt.id}>
                <label className="check" style={{ margin: 0, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => toggleEmploymentPriority(opt.id)}
                  />
                  <span>
                    {opt.label}
                    {rank != null ? ` (#${rank})` : ''}
                  </span>
                </label>
                {included ? (
                  <span className="prio-btns">
                    <button
                      type="button"
                      className="add"
                      onClick={() => moveEmployment(opt.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="add"
                      onClick={() => moveEmployment(opt.id, 1)}
                    >
                      ↓
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
          <label>
            Minimum contract length (months, optional)
            <input
              type="number"
              min={0}
              value={prefs.minContractMonths ?? ''}
              onChange={(e) =>
                patchPrefs({
                  minContractMonths: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              placeholder="Leave empty for no floor"
            />
          </label>
          <label>
            Security clearance policy
            <select
              value={prefs.clearancePolicy}
              onChange={(e) =>
                patchPrefs({ clearancePolicy: e.target.value as ClearancePolicy })
              }
            >
              <option value="ignore">Ignore clearance language</option>
              <option value="flag">Flag as concern</option>
              <option value="skip">Hard skip / dealbreaker</option>
            </select>
          </label>
          <label>
            Blocked employers (one per line)
            <textarea
              rows={3}
              value={blockedEmployersText}
              onChange={(e) => {
                setBlockedEmployersText(e.target.value);
                markDirty();
              }}
              placeholder="Company or entity names to hard-skip"
            />
          </label>
          <label>
            Custom skip triggers (one per line)
            <textarea
              rows={5}
              value={skipTriggersText}
              onChange={(e) => {
                setSkipTriggersText(e.target.value);
                markDirty();
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.flagPermNotices}
              onChange={(e) => patchPrefs({ flagPermNotices: e.target.checked })}
            />
            <span>Flag PERM labor-certification notices</span>
          </label>

          <details className="advanced">
            <summary>Advanced</summary>
            <p className="note" style={{ marginTop: 12 }}>
              Soft signals
            </p>
            <label>
              Pay limits
              <select
                value={prefs.compensationMode}
                onChange={(e) =>
                  patchPrefs({ compensationMode: e.target.value as CompensationMode })
                }
              >
                <option value="suspend_floors">Ignore listed pay</option>
                <option value="use_floors">Skip jobs outside my min–max</option>
              </select>
            </label>
            <p className="note">
              Min/max only apply when “Skip jobs outside my min–max” is selected.
            </p>
            <div className="row">
              <label style={{ flex: 1 }}>
                Min ask (USD, optional)
                <input
                  type="number"
                  min={0}
                  value={prefs.compensationMinUsd ?? ''}
                  onChange={(e) =>
                    patchPrefs({
                      compensationMinUsd: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label style={{ flex: 1 }}>
                Max ask (USD, optional)
                <input
                  type="number"
                  min={0}
                  value={prefs.compensationMaxUsd ?? ''}
                  onChange={(e) =>
                    patchPrefs({
                      compensationMaxUsd: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.flagSuspiciousComp}
                onChange={(e) => patchPrefs({ flagSuspiciousComp: e.target.checked })}
              />
              <span>Flag suspiciously high or low pay vs typical market (rationale only)</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.preferStructuredWork}
                onChange={(e) => patchPrefs({ preferStructuredWork: e.target.checked })}
              />
              <span>Prefer structured / high-accountability JD language (soft Fit weight)</span>
            </label>
            <label>
              How full is your application pipeline?
              <select
                value={prefs.pipelineLoad}
                onChange={(e) => patchPrefs({ pipelineLoad: e.target.value as PipelineLoad })}
              >
                <option value="unset">Unset</option>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="heavy">Heavy</option>
              </select>
            </label>
            <p className="note">
              Adds a short note to Apply guidance only; does not reject roles.
            </p>

            <p className="note" style={{ marginTop: 14 }}>
              Role-type skips (all off by default — enable only what you want).
            </p>
            {SKIP_CATEGORY_OPTIONS.map((opt) => (
              <label className="check" key={opt.id}>
                <input
                  type="checkbox"
                  checked={Boolean(
                    (prefs.roleSkipCategories ?? DEFAULT_ROLE_SKIP_CATEGORIES)[opt.id]
                  )}
                  onChange={(e) =>
                    patchPrefs({
                      roleSkipCategories: {
                        ...DEFAULT_ROLE_SKIP_CATEGORIES,
                        ...prefs.roleSkipCategories,
                        [opt.id]: e.target.checked,
                      },
                    })
                  }
                />
                <span>
                  {opt.label}
                  <span className="hint"> — {opt.hint}</span>
                </span>
              </label>
            ))}

            <label className="check">
              <input
                type="checkbox"
                checked={prefs.flagShellEmployers}
                onChange={(e) => patchPrefs({ flagShellEmployers: e.target.checked })}
              />
              <span>Flag thin / new / unverifiable employers</span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.clearanceIncludePreferred}
                onChange={(e) => patchPrefs({ clearanceIncludePreferred: e.target.checked })}
              />
              <span>
                Also treat “preferred / able to obtain” clearance as in-scope for the policy
              </span>
            </label>
            <label>
              Clearance skip-until date (optional)
              <input
                type="date"
                value={prefs.clearanceSkipUntil || ''}
                onChange={(e) => patchPrefs({ clearanceSkipUntil: e.target.value })}
              />
            </label>
          </details>
        </section>
      ) : null}

      <div className="savebar">
        <button className="save" type="button" onClick={() => void save()} disabled={!dirty}>
          Save settings
        </button>
        <span className={`status${dirty ? ' dirty' : ''}`}>
          {dirty ? 'Unsaved changes — save before closing this tab.' : status}
        </span>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('JobLens options: #root missing');
createRoot(root).render(<Options />);
