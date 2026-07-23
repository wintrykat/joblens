/**
 * Offscreen document: watch prefers-color-scheme and notify the service worker.
 * Chrome toolbar theme usually tracks this; true Chrome glyph invert isn't available to extensions.
 */
const mq = window.matchMedia('(prefers-color-scheme: dark)');

function notify(): void {
  void chrome.runtime.sendMessage({
    type: 'joblens.colorScheme',
    dark: mq.matches,
  });
}

mq.addEventListener('change', notify);
notify();
