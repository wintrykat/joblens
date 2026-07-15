import { describe, expect, it } from 'vitest';
import { analysisToJson } from './jsonExport';
import { EMPTY_ANALYSIS } from '../types/domain';
import { makeAnalysis } from '../../tests/helpers/analysis';

describe('jsonExport', () => {
  it('emits triage schema v1', () => {
    const json = analysisToJson(EMPTY_ANALYSIS, {});
    expect(json.schema).toBe('joblens.triage/v1');
  });

  it('includes fit apply and skills', () => {
    const json = analysisToJson(
      makeAnalysis({
        fit: { label: 'Good fit', score: 85, rationale: 'ok' },
        apply: { verdict: 'yes', rationale: 'go' },
        skillMatches: [
          {
            requirement: 'TypeScript',
            status: 'match',
            confidence: 'high',
            evidence: 'y',
            reason: 'r',
          },
        ],
      }),
      { url: 'https://example.com/job', board: 'Indeed' }
    );
    expect(json.fit.score).toBe(85);
    expect(json.apply.verdict).toBe('yes');
    expect(json.skillMatches).toHaveLength(1);
  });
});
