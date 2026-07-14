# Security

JobLens was largely developed with AI assistance (Cursor). Treat the codebase as **personally useful and imperfectly reviewed**, not as having received a formal security audit. Prefer defense-in-depth if you adapt it beyond a single-operator Chrome profile.

## Do not commit secrets

Never commit:

- Anthropic API keys (`sk-ant-…`)
- Chrome extension signing keys (`keys/*.pem`)
- Packed `.crx` / release artifacts under `release/`
- `.env` files or browser profile exports containing `chrome.storage` data

`.gitignore` already excludes `keys/`, `release/`, `*.pem`, `*.crx`, and `.env*`.

## API key handling

JobLens stores the operator’s Anthropic key in `chrome.storage.local` and sends it directly from the extension to `api.anthropic.com`. Anyone with access to that browser profile can read the key. Use a dedicated key with spending limits; revoke it if the profile may have been shared.

## Signing key

`npm run pack` creates `keys/joblens.pem` on first run. That private key identifies your extension builds. Keep one local copy; do not push it. If it was ever published, generate a new key and treat old CRXs as untrusted for updates.

## Reporting

If you discover a vulnerability in JobLens itself (not a third-party job board), open a private security advisory on the GitHub repo or contact the maintainers through GitHub.
