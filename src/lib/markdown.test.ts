import { describe, expect, it } from 'vitest';
import { analysisToMarkdown } from './markdown';
import { makeAnalysis } from '../../tests/helpers/analysis';

describe('markdown', () => {
  it('renders masthead fit apply and skills', () => {
    const md = analysisToMarkdown(
      makeAnalysis({
        masthead: {
          organization: 'Acme',
          title: 'Engineer',
          workModel: 'remote',
          travel: 'None',
          employmentTerms: 'FT',
          healthInsurance: 'Unknown',
          payRange: 'n/a',
          seniority: 'Mid',
          workAuthorization: 'US',
        },
        fit: { label: 'Good fit', score: 85, rationale: 'Solid' },
        apply: { verdict: 'yes', rationale: 'Apply' },
        skillMatches: [
          {
            requirement: 'TypeScript',
            status: 'match',
            confidence: 'high',
            evidence: 'resume',
            reason: 'held',
          },
        ],
      }),
      'https://example.com/job'
    );
    expect(md).toMatch(/Acme/);
    expect(md).toMatch(/Good fit|85/);
    expect(md).toMatch(/TypeScript/);
    expect(md).toMatch(/Yes|Apply/i);
  });
});
