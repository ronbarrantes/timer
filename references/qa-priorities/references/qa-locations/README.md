# QA Locations MVP Extension

MVP browser extension based on `PLAN.md`:

- Two fields: `Locations` and `Priorities` (paste one value per line).
- Main input view with `Create`, `Reset`, and a settings button.
- Settings view for managing column titles, letter mappings, max rows, and column gap.
- Output view renders the grouped table with priority highlighting.
- Priority code sorting for values like `SS4:HV253.A`.
- Duplicate entries are removed case-insensitively before rendering.
- Zip packaging script for distribution.

## Run locally

1. Open Chromium-based browser extension settings.
2. Enable developer mode.
3. Load unpacked extension from `qa-locations-ext`.
4. Open the extension popup.

## Build distribution zip

```bash
./build-zip.sh
```

Output:

- `dist/qa-locations-mvp.zip` (generated artifact; not committed to git)

## Tests

```bash
npm install
npm test
```
