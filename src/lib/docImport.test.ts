import { describe, expect, it } from 'vitest';
import {
  CONFIG_PROPOSAL_PATHS,
  applyConfigProposalChanges,
  assertImportableFile,
  parseConfigProposal,
  sanitizeConfigForPropose,
} from './docImport';
import { DEFAULT_CONFIG } from './storage';

describe('docImport', () => {
  it('assertImportableFile allowlist', () => {
    expect(() => assertImportableFile('resume.doc')).toThrow();
    expect(assertImportableFile('notes.md')).toBe('.md');
    expect(assertImportableFile('cv.pdf')).toBe('.pdf');
    expect(assertImportableFile('resume.docx')).toBe('.docx');
  });

  it('sanitizeConfigForPropose omits apiKey', () => {
    const sanitized = sanitizeConfigForPropose({
      ...DEFAULT_CONFIG,
      apiKey: 'sk-secret',
    });
    expect('apiKey' in sanitized).toBe(false);
  });

  it('parseConfigProposal filters invalid paths', () => {
    const proposal = parseConfigProposal({
      summary: 'From resume',
      changes: [
        {
          id: '1',
          path: 'skillClaims',
          label: 'Add TypeScript',
          rationale: 'Listed on resume',
          value: [{ skill: 'TypeScript', standing: 'held', years: 4 }],
        },
        {
          id: '2',
          path: 'apiKey',
          label: 'steal key',
          rationale: 'bad',
          value: 'nope',
        },
        {
          id: '3',
          path: 'preferences.remoteOnly',
          label: 'Remote only',
          rationale: 'Notes say remote only',
          value: true,
        },
      ],
    });
    expect(proposal.changes).toHaveLength(2);
    expect(
      proposal.changes.every((c) =>
        (CONFIG_PROPOSAL_PATHS as readonly string[]).includes(c.path)
      )
    ).toBe(true);
  });

  it('applyConfigProposalChanges merges allowlisted fields', () => {
    const merged = applyConfigProposalChanges(DEFAULT_CONFIG, [
      {
        id: '1',
        path: 'skillClaims',
        label: 'Add TypeScript',
        rationale: '',
        value: [{ skill: 'TypeScript', standing: 'held', years: 4 }],
      },
      {
        id: '3',
        path: 'preferences.remoteOnly',
        label: 'Remote only',
        rationale: '',
        value: true,
      },
      {
        id: '4',
        path: 'locations',
        label: 'ZIP',
        rationale: '',
        value: [{ zip: '78758', radiusMiles: 25 }],
      },
    ]);
    expect(merged.skillClaims.some((c) => c.skill === 'TypeScript')).toBe(true);
    expect(merged.preferences.remoteOnly).toBe(true);
    expect(merged.locations.some((l) => l.zip === '78758')).toBe(true);
    expect(merged.apiKey).toBe('');
  });
});
