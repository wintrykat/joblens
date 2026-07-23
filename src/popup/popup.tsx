import { useState, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { boardDisplayNames } from '../lib/boards';
import { runScanOnTab } from '../lib/messaging';
import './popup.css';

function Popup(): JSX.Element {
  const [msg, setMsg] = useState('');

  const scan = async (): Promise<void> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await runScanOnTab(tab.id);
    if (!res.ok) {
      const detail = res.error ? ` ${res.error}` : '';
      setMsg(
        `JobLens is not active on this page.${detail} Supported: ${boardDisplayNames()}. Open a posting URL, not a search list.`
      );
      return;
    }
    window.close();
  };

  const bookmarks = (): void => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
  };
  const options = (): void => {
    void chrome.runtime.openOptionsPage();
  };

  return (
    <div className="pop">
      <div className="brand">
        <img className="brand-mark" src="/icons/icon32.png" width={18} height={18} alt="" />
        JobLens
      </div>
      <button type="button" onClick={() => void scan()}>
        Scan this page
      </button>
      <button type="button" onClick={bookmarks}>
        View bookmarks
      </button>
      <button type="button" onClick={options}>
        Options
      </button>
      {msg && <div className="msg">{msg}</div>}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('JobLens popup: #root missing');
createRoot(root).render(<Popup />);
