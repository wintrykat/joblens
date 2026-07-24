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

/** UST-shape: Bellevue HQ + Role Location Remote-US (country scope, not a state subset). */
export const UST_REMOTE_US = `
Analyst / Junior Developer
UST
Bellevue, WA · Remote
$56,000 - $84,000 a year
Role description: Analyst / Junior Developer. Gather requirements and develop applications.
UST provides a reasonable range of compensation for roles that may be hired in various U.S. markets as set forth below.
Role Location: Remote-US
Compensation Range: $56,000-$84,000
Benefits offerings vary in Puerto Rico.
All US employees who work in a state or locality with more generous paid sick leave will receive those benefits.
`.padEnd(700, ' ');

/** Turing-shape: multi-country OR list US/Canada/WEU — US states must clear. */
export const TURING_US_CANADA_WEU = `
Software Engineer — Turing
Remote
$200 - $300 an hour - Contract
Based in San Francisco, California, Turing is the world's leading research accelerator.
Location: Candidates must be based out of US, Canada or WEU countries (UK, Netherlands, Italy, Germany, …)
Engagement: flexible, minimum 10 hrs/week. Contractor.
Job description: Software Engineering evaluator creating datasets for LLMs in Python, JavaScript, C/C++, Java, Rust, and Go.
`.padEnd(700, ' ');

/** Clearance required — for skip-policy hard_skip tests. */
export const CLEARANCE_REQUIRED_JD = `
Senior Engineer — DefenseCo
Reston, VA · Hybrid
Active Secret clearance required. Must have current DoD security clearance.
Job description: build secure systems for federal clients.
`.padEnd(500, ' ');

/** IT-BSTAR-shape: U.S.-based developer (worker) + U.S.-based clients; no clearance. */
export const ITBSTAR_US_BASED_DEV = `
Web Developer
IT-BSTAR
Wexford, PA · Remote
Part-time
About the job
We are looking for a U.S.-based Web/Mobile Developer to work closely with our software development team and support client projects.
Requirements:
Strong communication skills and the ability to work directly with U.S.-based clients
Benefits:
Fully remote and flexible working environment
`.padEnd(600, ' ');

/** LinkedIn chrome noise: filter label without actual clearance requirement. */
export const CLEARANCE_UI_NOISE_JD = `
Web Developer — Acme
Remote
Fully remote role. Build React apps.
Security clearance
Easy Apply
`.padEnd(400, ' ');

/** Cormac-shape: Must be a U.S. Citizen (work auth, not residency). */
export const CORMAC_US_CITIZEN = `
Federal Healthcare - Technical Lead
Cormac Corporation
Qualifications:
Bachelor's degree in Computer Science, Software Engineering, Information Technology, or a related field.
Must be a U.S. Citizen.
Minimum of 7+ years of software development experience, with at least 2–3 years serving in a Technical Lead role.
Experience with JavaScript, TypeScript, React, Node.js, AWS, Docker, PostgreSQL.
`.padEnd(600, ' ');

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
