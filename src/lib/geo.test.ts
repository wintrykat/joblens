import { describe, expect, it } from 'vitest';
import {
  NO_LOCATIONS_GEO_REASON,
  applyDeterministicGeo,
  computeDeterministicGeo,
  extractZipFromText,
  haversineMiles,
  isNegatedLocationMention,
  pickLocationEvidenceLine,
  resolvePostingLocation,
} from './geo';
import { ONSITE_COMMUTE_DEALBREAKER } from './ratings';
import { EMPTY_ANALYSIS } from '../types/domain';
import {
  CUTSFORTH_REMOTE_EXCLUDE,
  LIVEFLOW_NYC_ONSITE,
  BOISE_REMOTE_EXCLUDE,
  SEATTLE_ONSITE_NOISE_ZIP,
} from '../../tests/fixtures/postings';
import { makeAnalysis } from '../../tests/helpers/analysis';

describe('geo', () => {
  it('marks nearby Austin ZIP eligible via haversine', () => {
    const geo = computeDeterministicGeo({
      locations: [{ zip: '78758', radiusMiles: 25 }],
      pageText: 'Austin TX 78701',
    });
    expect(geo?.verdict).toBe('eligible');
    expect(geo?.method).toBe('zip-haversine');
    expect(geo?.distanceMiles).toBeTypeOf('number');
  });

  it('LiveFlow-shape: excludes NYC when operator ZIPs are Austin/Philadelphia', () => {
    const nycGeo = computeDeterministicGeo({
      locations: [
        { zip: '78758', radiusMiles: 25 },
        { zip: '19152', radiusMiles: 30 },
      ],
      pageText: LIVEFLOW_NYC_ONSITE,
      statedLocation:
        'Senior Full Stack Engineer — LiveFlow — New York, NY (On-site, Full-time)',
    });
    expect(nycGeo?.verdict).toBe('excluded');
    expect(nycGeo?.distanceMiles ?? 0).toBeGreaterThan(30);
  });

  it('twin: Seattle onsite + noise operator ZIP is excluded for Austin radius', () => {
    const geo = computeDeterministicGeo({
      locations: [{ zip: '78758', radiusMiles: 25 }],
      pageText: SEATTLE_ONSITE_NOISE_ZIP,
      statedLocation: 'Senior Platform Engineer — Northwind Labs — Seattle, WA (On-site)',
    });
    expect(geo?.verdict).toBe('excluded');
    expect(geo?.distanceMiles ?? 0).toBeGreaterThan(25);
  });

  it('empty locations → onsite/hybrid geo unclear without commute dealbreaker', () => {
    const noLocGeo = applyDeterministicGeo(
      {
        ...EMPTY_ANALYSIS,
        masthead: { ...EMPTY_ANALYSIS.masthead, workModel: 'onsite' },
        geo: { verdict: 'eligible', reason: 'model invented', method: 'model' },
      },
      { locations: [], pageText: 'Austin, TX onsite' }
    );
    expect(noLocGeo.geo?.verdict).toBe('unclear');
    expect(noLocGeo.geo?.reason).toBe(NO_LOCATIONS_GEO_REASON);
    expect(noLocGeo.dealbreakers.some((d) => /commute radius/i.test(d.requirement))).toBe(
      false
    );
  });

  it('commute dealbreaker evidence prefers resolved posting label', () => {
    const floored = applyDeterministicGeo(
      makeAnalysis({
        masthead: {
          ...EMPTY_ANALYSIS.masthead,
          workModel: 'onsite',
          organization: 'LiveFlow',
          title: 'Engineer',
          location: 'New York, NY',
        },
      }),
      {
        locations: [{ zip: '78758', radiusMiles: 25 }],
        pageText: LIVEFLOW_NYC_ONSITE,
      }
    );
    expect(floored.geo?.verdict).toBe('excluded');
    const db = floored.dealbreakers.find((d) => d.requirement === ONSITE_COMMUTE_DEALBREAKER);
    expect(db?.evidence).toMatch(/New York|NY/i);
    expect(db?.evidence).not.toMatch(/^york$/i);
  });

  it('extractZipFromText and haversineMiles basics', () => {
    expect(extractZipFromText('Office at 78701 Austin')).toBe('78701');
    const miles = haversineMiles([30.27, -97.74], [30.31, -97.71]);
    expect(miles).toBeGreaterThan(0);
    expect(miles).toBeLessThan(10);
  });

  it('negation window ignores applications-from without polarity', () => {
    const positive = 'We welcome applications from New York engineers.';
    const idx = positive.indexOf('New York');
    expect(isNegatedLocationMention(positive, idx)).toBe(false);
    const negated =
      'We are not accepting applications from New York at this time.';
    expect(isNegatedLocationMention(negated, negated.indexOf('New York'))).toBe(true);
  });

  it('pickLocationEvidenceLine matches posting tokens', () => {
    const evidence = pickLocationEvidenceLine(
      'Acme Corp\nSeattle, WA · On-site\nBuild things',
      'Seattle, WA'
    );
    expect(evidence).toMatch(/Seattle/);
  });

  it('Cutsforth exclusion list is not chosen as posting city', () => {
    const loc = resolvePostingLocation({ pageText: CUTSFORTH_REMOTE_EXCLUDE });
    expect(loc?.kind).toBe('city');
    expect(loc?.label || '').not.toMatch(/new york/i);
  });

  it('twin: Boise exclude list is not chosen as posting city', () => {
    const loc = resolvePostingLocation({ pageText: BOISE_REMOTE_EXCLUDE });
    expect(loc?.kind).toBe('city');
    expect(loc?.label || '').not.toMatch(/arizona|nevada|utah/i);
  });

  it('City, ST · Remote header keeps city in geo label (not bare state)', () => {
    const pageText = `
UI / Web Designer
Maxim Licensing
San Antonio, TX · Remote
About the Job: design in Figma. Remotely, but will ask to come into the San Antonio office periodically for meetings and training.
`.padEnd(500, ' ');
    const loc = resolvePostingLocation({ pageText });
    expect(loc?.kind).toBe('city');
    expect(loc?.label).toMatch(/San Antonio/i);
    expect(loc?.label).not.toBe('Texas');

    const geo = computeDeterministicGeo({
      locations: [{ zip: '78758', radiusMiles: 25 }],
      pageText,
    });
    expect(geo?.reason).toMatch(/San Antonio/i);
    expect(geo?.reason).not.toMatch(/\bTexas is\b/);
  });

  it('unknown City, ST still labels with city name when using state centroid', () => {
    const pageText = 'Role at Acme\nLubbock, TX · Remote\nFully remote with occasional training.'.padEnd(
      400,
      ' '
    );
    const loc = resolvePostingLocation({ pageText });
    expect(loc?.label).toMatch(/Lubbock,\s*TX/i);
    expect(loc?.label).not.toBe('Texas');
  });
});
