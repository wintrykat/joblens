# Extension signing keys

This directory holds the local CRXv3 private key used by `npm run pack`.

- **Do not commit** `*.pem` files (gitignored).
- On first `npm run pack`, `crx3` writes `joblens.pem` here.
- Keep the same key across your own releases so the extension ID stays stable.
- Each developer / CI environment should use its own key unless you intentionally share one for update continuity.

If a private key was exposed, discard it, pack with a new key, and rotate any related distribution.
