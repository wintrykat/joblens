import { handleBackgroundRequest } from '../lib/backgroundHandle';
import { OpenSidePanelRequestSchema } from '../types/messages';

void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => {
    console.warn('JobLens: setPanelBehavior failed', err);
  });

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const openReq = OpenSidePanelRequestSchema.safeParse(msg);
  if (openReq.success) {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: 'No tab for side panel open.' });
      return false;
    }
    const startScan = openReq.data.startScan !== false;
    try {
      if (startScan) {
        void chrome.storage.session.set({ pendingScan: true, pendingScanTabId: tabId });
      }
      void chrome.sidePanel.open({ tabId }).then(
        () => sendResponse({ ok: true, data: { opened: true } }),
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error: message });
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    }
    return true;
  }

  handleBackgroundRequest(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    });
  return true;
});
