import { describe, expect, it } from 'vitest';
import {
  AnalysisSchema,
  ConfigSchema,
  DEFAULT_PREFERENCES,
  EMPTY_ANALYSIS,
  FIT_LABEL_BY_SCORE,
} from './domain';

describe('domain schemas', () => {
  it('ConfigSchema defaults preflightMode', () => {
    expect(ConfigSchema.parse({ model: 'claude-sonnet-5' }).preflightMode).toBe('auto');
    expect(
      ConfigSchema.parse({ model: 'claude-sonnet-5', preflightMode: 'hybrid' }).preflightMode
    ).toBe('hybrid');
  });

  it('EMPTY_ANALYSIS parses and preferences defaults', () => {
    expect(AnalysisSchema.parse({})).toMatchObject({
      fit: EMPTY_ANALYSIS.fit,
      apply: EMPTY_ANALYSIS.apply,
    });
    expect(DEFAULT_PREFERENCES.occasionalTravelAllowance).toBe('none');
    expect(DEFAULT_PREFERENCES.remoteOnly).toBe(false);
  });

  it('FIT_LABEL_BY_SCORE maps band scores', () => {
    expect(FIT_LABEL_BY_SCORE[100]).toMatch(/Perfect/i);
    expect(FIT_LABEL_BY_SCORE[85]).toMatch(/Good/i);
    expect(FIT_LABEL_BY_SCORE[0]).toMatch(/Poor/i);
  });
});
