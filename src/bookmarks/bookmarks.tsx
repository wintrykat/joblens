import { useEffect, useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { getConfig, removeBookmark } from '../lib/storage';
import { watchThemeFromConfig } from '../lib/theme';
import { analysisToMarkdown } from '../lib/markdown';
import { analysisToJsonString } from '../lib/jsonExport';
import type { Bookmark } from '../types/domain';
import '../options/options.css';

function Bookmarks(): JSX.Element {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [copiedUrl, setCopiedUrl] = useState('');

  useEffect(() => {
    void getConfig().then((c) => setItems(c.bookmarks));
  }, []);

  useEffect(() => watchThemeFromConfig(), []);

  const del = async (url: string): Promise<void> => {
    setItems(await removeBookmark(url));
  };

  const copyMd = async (b: Bookmark): Promise<void> => {
    await navigator.clipboard.writeText(analysisToMarkdown(b.analysis, b.url));
    setCopiedUrl(`md:${b.url}`);
    setTimeout(() => setCopiedUrl(''), 1500);
  };

  const copyJson = async (b: Bookmark): Promise<void> => {
    await navigator.clipboard.writeText(
      analysisToJsonString(b.analysis, {
        url: b.url,
        board: b.board || '',
        company: b.company,
        title: b.title,
        savedAt: b.savedAt,
      })
    );
    setCopiedUrl(`json:${b.url}`);
    setTimeout(() => setCopiedUrl(''), 1500);
  };

  return (
    <div className="wrap">
      <h1>JobLens bookmarks</h1>
      {items.length === 0 && (
        <section>
          <p className="note">No saved postings yet.</p>
        </section>
      )}
      {items.map((b) => {
        const m = b.analysis.masthead;
        return (
          <section key={b.url}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {b.company || m.organization || 'Unknown'}
                </div>
                <div style={{ color: 'var(--jl-text)' }}>{b.title || m.title}</div>
                <a href={b.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                  {b.url}
                </a>
                <div className="note" style={{ marginTop: 6 }}>
                  {b.board ? `${b.board} · ` : ''}
                  {String(m.workModel)} · {String(m.employmentTerms)} · {m.payRange || 'pay n/a'} ·
                  saved {new Date(b.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="add" type="button" onClick={() => void copyMd(b)}>
                  {copiedUrl === `md:${b.url}` ? 'Copied' : 'Copy markdown'}
                </button>
                <button className="add" type="button" onClick={() => void copyJson(b)}>
                  {copiedUrl === `json:${b.url}` ? 'Copied' : 'Copy JSON'}
                </button>
                <button className="rm" type="button" onClick={() => void del(b.url)}>
                  Delete
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('JobLens bookmarks: #root missing');
createRoot(root).render(<Bookmarks />);
