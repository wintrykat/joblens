/** Floating launcher + preflight badge styles (shadow root). */
export const launcherStyles = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

.dock {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
}

.badge {
  max-width: 280px;
  min-width: 140px;
  padding: 8px 12px;
  border-radius: 10px;
  color: #fff;
  background: #4a5568;
  box-shadow: 0 2px 10px rgba(0,0,0,.2);
  cursor: default;
}
.badge-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.badge-body {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  opacity: 0.95;
  white-space: pre-wrap;
  word-break: break-word;
}
.badge[data-verdict="idle"] { background: #4a5568; opacity: 0.85; }
.badge[data-verdict="loading"] { background: #4a5568; }
.badge[data-verdict="clear"] { background: #276749; }
.badge[data-verdict="soft"] { background: #975a16; }
.badge[data-verdict="hard_skip"] { background: #9b2c2c; }
.badge[data-verdict="unknown"] { background: #4a5568; }
.badge[data-verdict="error"] { background: #718096; }

.row {
  display: flex; gap: 8px; align-items: center;
}

.launcher {
  background: #1a1a2e; color: #fff; border: none; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.launcher:hover { background: #23233f; }

.quick {
  background: #2d3748; color: #edf2f7; border: none; border-radius: 10px;
  padding: 10px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,.2);
}
.quick:hover { background: #3d4a5c; }
.quick:disabled { opacity: 0.55; cursor: default; }
` as const;
