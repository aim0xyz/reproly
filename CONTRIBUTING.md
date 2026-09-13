# Contributing to BugDrop

Start with a bug you can reproduce. Include browser version, reproduction steps, expected/actual behavior, and a sanitized report if useful. Never attach real credentials, customer information, or private recordings to public issues.

## Run locally

Load `extension/` unpacked in Chrome. Use `npm run demo` for the local playground. After changing extension code, reload the extension at `chrome://extensions`, then reload the test webpage.

```sh
npm test
npm run check
npm run package
```

## Real-browser integration test

Install Playwright for development and its full Chromium browser. The current test uses the experimental CDP extension-action API and was developed against Playwright 1.62.1 / Chromium 151. It uses the production manifest, including the real temporary `activeTab` grant, without adding test-only host permissions.

```sh
npm install --no-save --package-lock=false playwright@1.62.1
npx playwright install chromium
node tests/e2e.cjs
```

The test starts a local demo server on port 4174, loads the extension into a disposable profile, and verifies capture, privacy omissions, failed requests, virtual-DOM-style rerenders, SPA routes, automatic and multiple screenshots, privacy masking, same-origin reload continuation, stopping, report editing, downloads, and deletion. Outputs go to ignored `test-results/`. It does not use your normal browser profile or accounts.

## Architecture

- `extension/background.js`: serialized report writes, document-scoped message checks, capture lifecycle, screenshot operations.
- `extension/content.js`: isolated-world input/click capture and sanitized bridge from the main page.
- `extension/recorder.js`: temporary main-world console/fetch/XHR/history hooks with cleanup.
- `extension/core.js`: event allowlist, heuristic masking, portable JSON schema, Markdown formatter.
- `extension/integrations.js`: provider-neutral handoff contract and pure provider payload formatters.
- `extension/popup.*`: explicit recording controls.
- `extension/review.*`: local review, removal, context editing, and exports.

Do not use `innerHTML` for captured content. New event types must pass the shared normalization boundary. Do not add collection of input values, headers, bodies, or authentication state as a convenience. Add a regression test for privacy or lifecycle fixes. Keep changes focused; discuss broad permission changes before implementing them.

Useful first contributions include minimal reproductions of framework incompatibilities, accessibility fixes, browser-version compatibility checks, and tests for accidental sensitive-data collection. Do not submit cosmetic PRs solely to increase contribution counts.

## Desktop controller checks

Run `npm run desktop:web`, then `node tests/desktop-http.cjs` for the local API access checks. Use `npm run desktop` to exercise the packaged-app shell during development. The device integration test requires the synthetic demo app (`xyz.aimo.bugdrop.demo`, sources in `tests/fixtures/native/`) installed and running in the chosen device:

```sh
TEST_PLATFORM=ios TEST_DEVICE=YOUR_SIMULATOR_UUID node tests/desktop-e2e.cjs
TEST_PLATFORM=android TEST_DEVICE=emulator-5554 node tests/desktop-e2e.cjs
```

The tests use a disposable Playwright browser and the real simulator APIs. They capture only the synthetic demo app. They do not install the fixtures automatically. Do not point them at a device showing private information. Captures remain in `~/BugDrop Captures/` for inspection.

`desktop/server.cjs` serves the loopback-only controller, `mobile/apps.cjs` discovers installed apps, and the CLI communicates recording state via Node IPC. The CLI remains usable without the desktop controller.
