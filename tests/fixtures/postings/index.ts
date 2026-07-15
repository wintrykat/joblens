/**
 * Named historical + synthetic isomorphic defect shapes for regression.
 * Production heuristics must not hardcode these names — fixtures only.
 */

/** LiveFlow-shape: onsite far city + noise operator ZIP on the page. */
export const LIVEFLOW_NYC_ONSITE = `
LiveFlow
New York, NY · On-site
Some noise ZIP 78758
Senior Full Stack Engineer — LiveFlow — New York, NY (On-site, Full-time)
Job description: build product in office daily.
`.padEnd(500, ' ');

/** Twin: Seattle onsite with a different-metro operator ZIP left as noise. */
export const SEATTLE_ONSITE_NOISE_ZIP = `
Northwind Labs
Seattle, WA · On-site
Candidate profile noise ZIP 78758 appears in footer notes only.
Senior Platform Engineer — Northwind Labs — Seattle, WA (On-site, Full-time)
Job description: onsite engineering team in Seattle HQ.
`.padEnd(500, ' ');

/** Cutsforth-shape: remote HQ + inverted state exclude + short training. */
export const CUTSFORTH_REMOTE_EXCLUDE = `
Full Stack Developer
Cutsforth, LLC
Ferndale, WA · Remote
Work Location: Remote but 2 weeks of mandatory training onsite
Must reside in the United States.
We are not accepting applicants for remote workers in California, Illinois, and New York at this time. Applications from any of these states can not be considered.
Job description: build APIs and UIs.
`.padEnd(600, ' ');

/** Twin: Boise remote + AZ/NV/UT exclude + 1 week onboarding. */
export const BOISE_REMOTE_EXCLUDE = `
Staff Engineer
Cascade Systems
Boise, ID · Remote
Work Location: Remote with 1 week of initial onboarding onsite
Must reside in the United States.
We are not accepting applicants for remote workers in Arizona, Nevada, and Utah at this time. Applications from any of these states can not be considered.
Job description: build APIs and distributed systems.
`.padEnd(600, ' ');

/** Nationwide remote — HQ city is not residency. */
export const MADISON_NATIONWIDE = `
SmartPlace — Full Stack .NET Developer
Madison, WI · Remote
NOTE: No WI residency required. Open to nationwide candidates. This position is currently remote.
`.padEnd(400, ' ');

/** Twin: Denver nationwide. */
export const DENVER_NATIONWIDE = `
Alpine Data — Backend Engineer
Denver, CO · Remote
NOTE: No CO residency required. Open to nationwide candidates. This position is currently remote.
`.padEnd(400, ' ');

/** Quarterly remote travel outside operator radius. */
export const DFW_QUARTERLY_REMOTE = `
Sr. Full Stack Developer — Dallas, TX 75019 · Remote
This is a direct-hire position working primarily remote, with occasional on-site presence required in Coppell / Dallas, TX.
Enjoy the flexibility of a remote work model (Texas-based preferred; quarterly on-site meetings in DFW).
Job description: build APIs and UIs.
`.padEnd(500, ' ');

/** Twin: Boston HQ / Chicago quarterly. */
export const BOSTON_CHICAGO_QUARTERLY = `
Principal Engineer — Boston, MA · Remote
Primarily remote role with quarterly on-site meetings in Chicago, IL.
Job description: lead platform architecture and mentoring.
`.padEnd(500, ' ');

export const MATRIX_SKILL_MATCHES = [
  {
    requirement: 'Significant experience working with modern Javascript',
    evidence: '11y JS',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'Knowledge of front-end languages (React, Ember.js, SCSS)',
    evidence: 'React/TypeScript',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'Knowledge of Python backed APIs (Flask, Sanic)',
    evidence: 'Flask/Django',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'Familiarity with Docker and Kubernetes',
    evidence: 'Docker production; K8s limited',
    reason: 'Partial Docker/K8s coverage',
    status: 'partial' as const,
    confidence: 'medium' as const,
  },
];

/** Twin: same match/partial shape, different skills/org. */
export const ORION_SKILL_MATCHES = [
  {
    requirement: 'Strong Go microservices experience',
    evidence: 'Go services',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'PostgreSQL and schema design',
    evidence: 'Postgres production',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'gRPC and protobuf',
    evidence: 'gRPC APIs',
    reason: 'Direct match',
    status: 'match' as const,
    confidence: 'high' as const,
  },
  {
    requirement: 'Familiarity with Terraform',
    evidence: 'Some modules',
    reason: 'Partial coverage',
    status: 'partial' as const,
    confidence: 'medium' as const,
  },
];
