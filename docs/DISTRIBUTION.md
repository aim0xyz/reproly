# Desktop distribution

Patchmason targets current 64-bit desktop systems:

- macOS 11 or newer as one universal Intel and Apple Silicon DMG.
- Windows 10 or newer with separate x64 and ARM64 installers.
- Linux x64 and ARM64 as AppImage and Debian packages.

Node.js is bundled with the desktop application. Users do not need Node.js or a terminal. Local desktop-app capture is available on all supported operating systems. Android capture additionally needs Android platform-tools (`adb`) on every operating system. iOS Simulator capture is available only on macOS with Xcode.

## Releases

Pushing a tag matching `v*` runs `.github/workflows/desktop-build.yml`. The workflow tests and builds on native GitHub-hosted runners, creates the GitHub Release, gives the primary downloads stable filenames, and publishes SHA-256 checksums. The website links to those stable filenames through GitHub's `releases/latest/download/` endpoint.

## Signing

Unsigned builds can be downloaded and run, but macOS Gatekeeper and Windows SmartScreen may show warnings. Configure these GitHub Actions secrets before a public release:

- `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD`: exported Developer ID Application certificate and its password.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`: Apple notarization credentials.
- `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`: Windows Authenticode certificate and its password.

Electron Builder reads these variables during the native build. Never commit certificate files, passwords, or notarization credentials to the repository.
