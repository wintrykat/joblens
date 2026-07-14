import type { JSX } from 'react';
import type { Analysis, ApplyVerdict, FitLabel, PanelUiState } from '../types/domain';

export type TriagePanelProps = {
  boardName?: string;
  state: PanelUiState;
  analysis: Analysis | null;
  error?: string;
  saved?: boolean;
  copied?: boolean;
  copiedJson?: boolean;
  /** When idle, show a primary Scan CTA */
  showScanCta?: boolean;
  /** Non-blocking note when profile skills/geo need attention */
  profileWarning?: string;
  /** When true, banner is required-geo (stronger); false = soft skills note */
  profileWarningRequired?: boolean;
  footer?: JSX.Element | null;
  onScan: () => void;
  onBookmark: () => void;
  onCopyMarkdown: () => void;
  onCopyJson: () => void;
  onOpenOptions?: () => void;
};

function fitBadgeClass(label: FitLabel): string {
  switch (label) {
    case 'Perfect fit':
      return 'b-fit-perfect';
    case 'Excellent fit':
      return 'b-fit-excellent';
    case 'Good fit':
      return 'b-fit-good';
    case 'Possible fit':
      return 'b-fit-possible';
    case 'Unlikely fit':
      return 'b-fit-unlikely';
    case 'Poor fit':
      return 'b-fit-poor';
    default:
      return 'b-mid';
  }
}

function applyBadgeClass(verdict: ApplyVerdict): string {
  if (verdict === 'yes') return 'b-apply-yes';
  if (verdict === 'no') return 'b-apply-no';
  return 'b-apply-maybe';
}

function applyLabel(verdict: ApplyVerdict): string {
  if (verdict === 'yes') return 'Yes';
  if (verdict === 'no') return 'No';
  return 'Maybe';
}

export function TriagePanel({
  boardName,
  state,
  analysis,
  error = '',
  saved = false,
  copied = false,
  copiedJson = false,
  showScanCta = true,
  profileWarning = '',
  profileWarningRequired = false,
  footer = null,
  onScan,
  onBookmark,
  onCopyMarkdown,
  onCopyJson,
  onOpenOptions,
}: TriagePanelProps): JSX.Element {
  const m = analysis?.masthead;
  const geo = analysis?.geo;
  const fit = analysis?.fit;
  const apply = analysis?.apply;
  const geoClass =
    geo?.verdict === 'eligible' ? 'b-ok' : geo?.verdict === 'excluded' ? 'b-no' : 'b-mid';

  const warningBanner = profileWarning ? (
    <div
      className={`profile-warn${profileWarningRequired ? ' profile-warn-required' : ''}`}
      role="status"
    >
      <p>{profileWarning}</p>
      {onOpenOptions ? (
        <button type="button" className="linkish" onClick={onOpenOptions}>
          Open Options
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="panel">
      <div className="head">
        <h1>JobLens{boardName ? ` · ${boardName}` : ''}</h1>
      </div>
      <div className="body">
        {warningBanner}

        {state === 'idle' && showScanCta && (
          <div className="idle">
            <p className="hint">
              Open a supported job posting, then scan to triage location, skills, and dealbreakers.
            </p>
            <div className="actions">
              <button className="primary" type="button" onClick={onScan}>
                Scan this page
              </button>
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div className="loading">
            <span className="spin" />
            Analyzing this posting…
          </div>
        )}
        {state === 'error' && <div className="error">{error}</div>}

        {state === 'error' && (
          <div className="actions">
            <button className="primary" type="button" onClick={onScan}>
              Try again
            </button>
          </div>
        )}

        {state === 'result' && analysis && m && (
          <>
            <div className="masthead">
              <div className="org">{m.organization || 'Unknown org'}</div>
              <div className="title">{m.title || 'Untitled role'}</div>

              {(fit || apply) && (
                <div className="ratings">
                  {fit && (
                    <span className={`badge ${fitBadgeClass(fit.label)}`}>
                      {fit.label} · {fit.score}%
                    </span>
                  )}
                  {apply && (
                    <span className={`badge ${applyBadgeClass(apply.verdict)}`}>
                      Apply? {applyLabel(apply.verdict)}
                    </span>
                  )}
                </div>
              )}
              {fit?.rationale ? <div className="rating-note">{fit.rationale}</div> : null}
              {apply?.rationale && apply.rationale !== fit?.rationale ? (
                <div className="rating-note">{apply.rationale}</div>
              ) : null}

              <div className="k">Model</div>
              <div>{m.workModel || '—'}</div>
              <div className="k">Terms</div>
              <div>{m.employmentTerms || '—'}</div>
              <div className="k">Travel</div>
              <div>{m.travel || '—'}</div>
              <div className="k">Health</div>
              <div>{m.healthInsurance || '—'}</div>
              <div className="k">Pay</div>
              <div>{m.payRange || '—'}</div>
              <div className="k">Seniority</div>
              <div>{m.seniority || '—'}</div>
              {m.workAuthorization ? (
                <>
                  <div className="k">Auth</div>
                  <div>{m.workAuthorization}</div>
                </>
              ) : null}
            </div>

            {geo && (
              <div className="section">
                <h2>Location</h2>
                <span className={`badge ${geoClass}`}>{geo.verdict}</span>
                {geo.method === 'zip-haversine' && (
                  <span className="badge b-mid" style={{ marginLeft: 6 }}>
                    computed
                  </span>
                )}
                <div className="flag" style={{ borderLeft: 'none' }}>
                  <div className="why">{geo.reason}</div>
                </div>
              </div>
            )}

            {analysis.dealbreakers.length > 0 && (
              <div className="section">
                <h2>Dealbreakers</h2>
                {analysis.dealbreakers.map((d, i) => (
                  <div className="deal" key={i}>
                    <div className="req">{d.requirement}</div>
                    {d.reason && <div className="why">{d.reason}</div>}
                    {d.evidence && <div className="ev">{d.evidence}</div>}
                  </div>
                ))}
              </div>
            )}

            {analysis.skipFlags.length > 0 && (
              <div className="section">
                <h2>Skip triggers matched</h2>
                {analysis.skipFlags.map((s, i) => (
                  <div className="skip" key={i}>
                    <div className="req">{s.trigger}</div>
                    {s.evidence && <div className="ev">{s.evidence}</div>}
                  </div>
                ))}
              </div>
            )}

            {analysis.skillMatches.length > 0 && (
              <div className="section">
                <h2>Skills</h2>
                {analysis.skillMatches.map((s, i) => (
                  <div className={`flag ${s.status}`} key={i}>
                    <div className="req">
                      {s.status === 'match' ? '✓ ' : s.status === 'partial' ? '~ ' : '✗ '}
                      {s.requirement} <span className="k">({s.confidence})</span>
                    </div>
                    {s.reason && <div className="why">{s.reason}</div>}
                    {s.evidence && <div className="ev">{s.evidence}</div>}
                  </div>
                ))}
              </div>
            )}

            {analysis.postingSmell && (
              <div className="section">
                <h2>Note</h2>
                <div className="hint">{analysis.postingSmell}</div>
              </div>
            )}

            {analysis.declutteredJD && (
              <div className="section">
                <h2>Decluttered posting</h2>
                <div className="jd">{analysis.declutteredJD}</div>
              </div>
            )}

            <div className="actions">
              <button className="primary" type="button" onClick={onBookmark} disabled={saved}>
                {saved ? 'Bookmarked' : 'Bookmark'}
              </button>
              <button type="button" onClick={onCopyMarkdown}>
                {copied ? 'Copied' : 'Copy markdown'}
              </button>
              <button type="button" onClick={onCopyJson}>
                {copiedJson ? 'Copied' : 'Copy JSON'}
              </button>
              <button type="button" onClick={onScan}>
                Rescan
              </button>
            </div>
          </>
        )}
      </div>
      {footer}
    </div>
  );
}
