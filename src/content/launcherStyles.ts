/** Minimal floating Scan button styles (shadow root). */
export const launcherStyles = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

.launcher {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
  background: #1a1a2e; color: #fff; border: none; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.launcher:hover { background: #23233f; }
` as const;
