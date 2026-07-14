import { useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfig, setConfig } from '../lib/storage';
import { extractSkills } from '../lib/messaging';
import {
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  EDUCATION_LEVELS,
} from '../lib/settingsOptions';
import type {
  Confidence,
  Config,
  ExtractedSkill,
  Location,
  ThemePreference,
  WorkHistoryEntry,
} from '../types/domain';
import { watchThemeFromConfig, applyTheme } from '../lib/theme';
import './options.css';

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

function Options(): JSX.Element {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [status, setStatus] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Draft text keeps intermediate newlines; parseLines on every keystroke was eating Enter.
  const [proficienciesText, setProficienciesText] = useState('');
  const [deficienciesText, setDeficienciesText] = useState('');
  const [skipTriggersText, setSkipTriggersText] = useState('');

  useEffect(() => {
    void getConfig().then((c) => {
      setCfg(c);
      setProficienciesText(c.proficiencies.join('\n'));
      setDeficienciesText(c.deficiencies.join('\n'));
      setSkipTriggersText(c.skipTriggers.join('\n'));
      setDirty(false);
    });
  }, []);

  useEffect(() => watchThemeFromConfig(), []);

  // Warn before tab/window close when there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Chrome requires returnValue to be set for the confirmation dialog.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!cfg) return <div className="wrap">Loading…</div>;

  const markDirty = (): void => setDirty(true);

  const patch = (p: Partial<Config>): void => {
    setCfg({ ...cfg, ...p });
    if (p.theme) applyTheme(p.theme);
    markDirty();
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

  const setSkill = <K extends keyof ExtractedSkill>(
    i: number,
    k: K,
    v: ExtractedSkill[K]
  ): void => {
    const s = cfg.extractedSkills.slice();
    const current = s[i];
    if (!current) return;
    s[i] = { ...current, [k]: v };
    patch({ extractedSkills: s });
  };

  const rmSkill = (i: number): void =>
    patch({ extractedSkills: cfg.extractedSkills.filter((_, j) => j !== i) });

  const addSkill = (): void =>
    patch({
      extractedSkills: [
        ...cfg.extractedSkills,
        { skill: '', years: 0, source: 'manual', confidence: 'high' },
      ],
    });

  const runExtract = async (): Promise<void> => {
    setExtracting(true);
    setStatus('Extracting skills from work history…');
    const res = await extractSkills({ workHistory: cfg.workHistory });
    setExtracting(false);
    if (!res.ok) {
      setStatus('Extraction failed: ' + res.error);
      return;
    }
    const existing = new Set(cfg.extractedSkills.map((s) => s.skill.toLowerCase()));
    const merged = [
      ...cfg.extractedSkills,
      ...res.data.skills.filter((s) => !existing.has((s.skill || '').toLowerCase())),
    ];
    patch({ extractedSkills: merged });
    setStatus(
      `Extracted ${res.data.skills.length} skills. Review and edit below, then Save. Nothing is trusted for matching until you save.`
    );
  };

  const save = async (): Promise<void> => {
    const toSave: Config = {
      ...cfg,
      model: modelValue,
      proficiencies: parseLines(proficienciesText),
      deficiencies: parseLines(deficienciesText),
      skipTriggers: parseLines(skipTriggersText),
    };
    await setConfig(toSave);
    setCfg(toSave);
    setProficienciesText(toSave.proficiencies.join('\n'));
    setDeficienciesText(toSave.deficiencies.join('\n'));
    setSkipTriggersText(toSave.skipTriggers.join('\n'));
    setDirty(false);
    setStatus('Saved.');
    setTimeout(() => setStatus(''), 2000);
  };

  return (
    <div className="wrap">
      <h1>JobLens settings</h1>

      <section>
        <h2>API</h2>
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
          Stored only in this browser profile and sent directly to the Anthropic API.
          Anyone with access to the profile can read it — use a dedicated key with limits.
          Never commit a key or ship a build that embeds one.
        </p>
        <label>
          Model
          <select
            value={modelValue}
            onChange={(e) => patch({ model: e.target.value })}
          >
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.id})
              </option>
            ))}
          </select>
        </label>
        {!modelIds.has(cfg.model) && cfg.model ? (
          <p className="note">
            Previous model <code>{cfg.model}</code> is not in the current list; Sonnet 5 is selected.
            Save to persist.
          </p>
        ) : null}
      </section>

      <section>
        <h2>Appearance</h2>
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
        <p className="note">
          JobLens Light/Dark overrides everything. Default follows Chrome Appearance when set
          (Light/Dark/Device), otherwise the system theme via <code>prefers-color-scheme</code>.
        </p>
      </section>

      <section>
        <h2>Profile</h2>
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
          Proficiencies (one per line — skills you hold strongly)
          <textarea
            rows={5}
            value={proficienciesText}
            onChange={(e) => {
              setProficienciesText(e.target.value);
              patch({ proficiencies: parseLines(e.target.value) });
            }}
            placeholder={'TypeScript\nReact\nSystem design'}
          />
        </label>
        <label>
          Known gaps (one per line — flag hard when a posting demands them)
          <textarea
            rows={3}
            value={deficienciesText}
            onChange={(e) => {
              setDeficienciesText(e.target.value);
              patch({ deficiencies: parseLines(e.target.value) });
            }}
            placeholder={'Kubernetes\nRuby'}
          />
        </label>
      </section>

      <section>
        <h2>Locations</h2>
        <p className="note">Onsite/hybrid radius checks. Add each ZIP you&apos;d commute to.</p>
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

      <section>
        <h2>Extracted skills — review before saving</h2>
        <p className="note">
          This is what matching trusts. Fix years, delete anything unsupported, add anything missed.
          The extractor is told to stay conservative and scope claims narrowly.
        </p>
        <table className="skills">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Years</th>
              <th>Source</th>
              <th>Conf.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cfg.extractedSkills.map((s, i) => (
              <tr key={i}>
                <td>
                  <input value={s.skill} onChange={(e) => setSkill(i, 'skill', e.target.value)} />
                </td>
                <td>
                  <input
                    type="number"
                    value={s.years}
                    onChange={(e) => setSkill(i, 'years', Number(e.target.value))}
                    style={{ maxWidth: 70 }}
                  />
                </td>
                <td>
                  <input value={s.source} onChange={(e) => setSkill(i, 'source', e.target.value)} />
                </td>
                <td>
                  <select
                    value={s.confidence}
                    onChange={(e) => setSkill(i, 'confidence', e.target.value as Confidence)}
                  >
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </td>
                <td>
                  <button className="rm" type="button" onClick={() => rmSkill(i)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add" type="button" onClick={addSkill}>
          + skill
        </button>
      </section>

      <section>
        <h2>Auto-skip triggers</h2>
        <p className="note">
          One per line. The analyzer flags any posting that matches, with the triggering line.
        </p>
        <textarea
          rows={7}
          value={skipTriggersText}
          onChange={(e) => {
            setSkipTriggersText(e.target.value);
            patch({ skipTriggers: parseLines(e.target.value) });
          }}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.flagPermNotices}
            onChange={(e) => patch({ flagPermNotices: e.target.checked })}
          />
          <span>
            Flag PERM labor-certification notices (boilerplate green-card / labor-cert postings
            rather than a genuine open role)
          </span>
        </label>
      </section>

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
