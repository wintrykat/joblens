import type { Analysis } from '../types/domain';

export function analysisToMarkdown(
  a: Analysis | null | undefined,
  url: string
): string {
  if (!a) return '';
  const m = a.masthead;
  const line = (label: string, val: string | undefined): string =>
    val ? `- **${label}:** ${val}\n` : '';

  let md = `# ${m.organization || 'Unknown org'} — ${m.title || 'Untitled role'}\n\n`;
  md += `${url}\n\n`;

  if (a.fit) {
    md += `**Fit:** ${a.fit.label} (${a.fit.score}%)`;
    if (a.fit.rationale) md += ` — ${a.fit.rationale}`;
    md += `\n`;
  }
  if (a.apply) {
    const v =
      a.apply.verdict === 'yes' ? 'Yes' : a.apply.verdict === 'no' ? 'No' : 'Maybe';
    md += `**Apply?:** ${v}`;
    if (a.apply.rationale) md += ` — ${a.apply.rationale}`;
    md += `\n\n`;
  } else {
    md += `\n`;
  }

  md += `## Masthead\n`;
  md += line('Work model', String(m.workModel || ''));
  md += line('Travel', String(m.travel || ''));
  md += line('Terms', String(m.employmentTerms || ''));
  md += line('Health insurance', String(m.healthInsurance || ''));
  md += line('Pay', m.payRange);
  md += line('Seniority', m.seniority);
  md += line('Work authorization', m.workAuthorization);
  md += '\n';

  if (a.geo) {
    md += `## Location\n- **${a.geo.verdict}** — ${a.geo.reason || ''}\n\n`;
  }

  if (a.dealbreakers.length) {
    md += `## Dealbreakers\n`;
    a.dealbreakers.forEach((d) => {
      md += `- ${d.requirement} — ${d.reason || ''}\n  > ${d.evidence || ''}\n`;
    });
    md += '\n';
  }

  if (a.skipFlags.length) {
    md += `## Skip flags\n`;
    a.skipFlags.forEach((s) => {
      md += `- ${s.trigger}\n  > ${s.evidence || ''}\n`;
    });
    md += '\n';
  }

  if (a.skillMatches.length) {
    md += `## Skills\n`;
    a.skillMatches.forEach((s) => {
      const icon = s.status === 'match' ? '✓' : s.status === 'partial' ? '~' : '✗';
      md += `- ${icon} ${s.requirement} (${s.confidence})\n`;
      if (s.reason) md += `  ${s.reason}\n`;
      md += `  > ${s.evidence || ''}\n`;
    });
    md += '\n';
  }

  if (a.postingSmell) md += `## Note\n${a.postingSmell}\n\n`;
  if (a.declutteredJD) md += `## Decluttered posting\n${a.declutteredJD}\n`;

  return md;
}
