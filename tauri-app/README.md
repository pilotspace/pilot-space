# Pilot Space Desktop (Tauri)

Native desktop client wrapping the Pilot Space web app with local git operations, embedded terminal, pilot CLI integration, and cross-platform packaging.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | 1.77.2+ | [rustup.rs](https://rustup.rs/) |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | `npm i -g pnpm` |
| **Python** | 3.12+ | Required only for building pilot-cli sidecar |
| **uv** | Latest | `pip install uv` (Python package manager) |

### Platform-Specific Dependencies

**macOS** — No extra deps (WebKit is built-in).

**Linux (Ubuntu/Debian)**:
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Windows** — WebView2 is included in Windows 10/11. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++".

## Quick Start (Development)

```bash
# 1. Install frontend dependencies
cd frontend && pnpm install

# 2. Install Tauri CLI
cd ../tauri-app && pnpm install

# 3. Start backend + Supabase (separate terminals)
cd backend && uv run uvicorn pilot_space.main:app --reload --port 8000
cd infra/supabase && docker compose up -d

# 4. Launch desktop app (starts frontend dev server automatically)
cd tauri-app && pnpm tauri:dev
```

The `tauri:dev` command:
1. Runs `cd ../frontend && pnpm dev` (Next.js on `:3000`)
2. Compiles Rust backend (~3-5 min first time, <30s cached)
3. Opens native window pointing at `http://localhost:3000`

> **First build?** Cargo downloads and compiles ~490 crates. Subsequent builds only recompile changed code.

## Project Structure

```
tauri-app/
├── package.json              # Tauri CLI scripts
├── src-tauri/
│   ├── Cargo.toml            # Rust dependencies
│   ├── Cargo.lock            # Locked Rust deps (committed)
│   ├── tauri.conf.json       # App config, window, plugins, bundle
│   ├── Entitlements.plist    # macOS hardened runtime entitlements
│   ├── build.rs              # Tauri build script
│   ├── capabilities/
│   │   └── default.json      # Tauri v2 permission grants
│   ├── icons/                # App icons (.png, .icns, .ico)
│   ├── binaries/             # Sidecar binaries (CI-built, gitignored)
│   │   └── .gitkeep
│   └── src/
│       ├── main.rs           # Entry point (calls lib::run)
│       ├── lib.rs            # Plugin registration, command handlers
│       └── commands/
│           ├── mod.rs         # Module exports
│           ├── auth.rs        # JWT sync, keychain, token migration
│           ├── workspace.rs   # Project directory management
│           ├── git.rs         # Clone, pull, push, branch, status, diff, commit
│           ├── terminal.rs    # PTY sessions with batched output
│           ├── sidecar.rs     # Spawn pilot-cli binary
│           └── tray.rs        # System tray, notifications
└── frontend/                  # → ../frontend (shared with web app)
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Tauri Shell (native window)            │
│  ┌───────────────────────────────────┐  │
│  │  Next.js WebView                  │  │
│  │  (same UI as web app)             │  │
│  │                                   │  │
│  │  + IPC bridge (tauri.ts)          │  │
│  │    → 40+ typed invoke() wrappers  │  │
│  └───────────────────────────────────┘  │
│  Rust Backend (src-tauri/)              │
│  ├── auth.rs    → OS keychain + JWT     │
│  ├── git.rs     → git2-rs operations    │
│  ├── terminal.rs → PTY + xterm.js       │
│  ├── sidecar.rs → pilot-cli binary      │
│  └── tray.rs    → system tray + notifs  │
│                                         │
│  Remote: FastAPI backend over HTTPS     │
│  (not bundled — connects to hosted API) │
└─────────────────────────────────────────┘
```

**Dual-deploy mode**: The frontend builds as both:
- `output: 'standalone'` — for Docker/web deployment (default)
- `output: 'export'` — for Tauri WebView (when `NEXT_TAURI=true`)

## Building for Production

### Local Production Build

```bash
cd tauri-app
pnpm tauri:build
```

Output: `src-tauri/target/release/bundle/`
- macOS: `.dmg` in `bundle/dmg/`
- Linux: `.deb` in `bundle/deb/`, `.AppImage` in `bundle/appimage/`
- Windows: `.msi` in `bundle/msi/`

### Building the Pilot CLI Sidecar

The desktop app bundles a compiled `pilot-cli` binary (no Python required on user machine):

```bash
# Install PyInstaller
cd cli && uv sync && uv pip install pyinstaller

# Build for current platform
uv run pyinstaller pilot.spec --noconfirm

# Copy to Tauri binaries directory
# macOS ARM:
cp dist/pilot-cli/pilot-cli ../tauri-app/src-tauri/binaries/pilot-cli-aarch64-apple-darwin
# macOS Intel:
cp dist/pilot-cli/pilot-cli ../tauri-app/src-tauri/binaries/pilot-cli-x86_64-apple-darwin
# Linux:
cp dist/pilot-cli/pilot-cli ../tauri-app/src-tauri/binaries/pilot-cli-x86_64-unknown-linux-gnu
# Windows:
copy dist\pilot-cli\pilot-cli.exe ..\tauri-app\src-tauri\binaries\pilot-cli-x86_64-pc-windows-msvc.exe
```

> **Note**: PyInstaller cannot cross-compile. Each platform binary must be built on that platform.

## CI/CD Pipelines

### Development Builds (`tauri-build.yml`)

Triggers on push to `main`, `develop`, `feat/tauri-*` branches and PRs.

```
┌─────────────────────────────────────────────────┐
│  4-runner matrix (parallel)                     │
│                                                 │
│  macOS ARM  │  macOS Intel │  Linux   │ Windows │
│  macos-14   │  macos-13    │  u22.04  │ latest  │
│             │              │          │         │
│  Each runner:                                   │
│  1. Install Node 20, pnpm 9, Rust stable       │
│  2. Download pilot-cli sidecar artifact         │
│  3. Sign sidecar (macOS/Windows, if secrets)    │
│  4. NEXT_TAURI=true pnpm build (static export)  │
│  5. tauri-apps/tauri-action@v0 → build app      │
│  6. Upload .dmg/.deb/.appimage/.msi artifacts    │
└─────────────────────────────────────────────────┘
```

### Sidecar Builds (`pilot-cli-build.yml`)

Builds pilot-cli binary for all 4 platforms via PyInstaller.

### Release Builds (`tauri-release.yml`)

Triggers on `v*` tag push. Two-job pipeline:

```
Job 1: build-sidecar (4 platforms)
         │
         ▼
Job 2: build-release (4 platforms)
         │
         ▼
     GitHub Release (draft)
     + latest.json update manifest
```

## Code Signing Setup

### macOS (Apple Developer)

Add these GitHub repository secrets:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_SIGNING_IDENTITY` | e.g., `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | 10-character team identifier |

Without these, CI produces **unsigned** builds (still functional, but Gatekeeper warns users).

### Windows (Azure Key Vault EV Certificate)

| Secret | Description |
|--------|-------------|
| `AZURE_KEY_VAULT_URI` | e.g., `https://your-vault.vault.azure.net` |
| `AZURE_KEY_VAULT_CLIENT_ID` | Service principal client ID |
| `AZURE_KEY_VAULT_CLIENT_SECRET` | Service principal secret |
| `AZURE_KEY_VAULT_TENANT_ID` | Azure AD tenant ID |
| `AZURE_KEY_VAULT_CERT_NAME` | Certificate name in Key Vault |

Without these, CI produces **unsigned** .msi (SmartScreen warns users).

### Auto-Update Signing

One-time setup:

```bash
cd tauri-app
pnpm tauri signer generate -w ~/.tauri/pilot-space.key
```

This outputs a public key. Then:
1. Copy public key → `tauri.conf.json` → `plugins.updater.pubkey`
2. Add `TAURI_SIGNING_PRIVATE_KEY` → GitHub secret (the private key content)
3. Add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` → GitHub secret

## Key Configuration

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_TAURI` | Build time | `true` = static export mode for Tauri |
| `NEXT_PUBLIC_API_URL` | Build time | Backend API URL (e.g., `https://api.pilotspace.io/api/v1`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Build time | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build time | Supabase anonymous key |

### Tauri Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-shell` | Spawn sidecar processes |
| `tauri-plugin-store` | Persistent JSON key-value storage |
| `tauri-plugin-notification` | Native OS notifications |
| `tauri-plugin-deep-link` | `pilotspace://` URL scheme for OAuth |
| `tauri-plugin-dialog` | Native folder picker dialogs |
| `tauri-plugin-fs` | Filesystem access |
| `tauri-plugin-updater` | In-app auto-update |

### Rust Crates

| Crate | Purpose |
|-------|---------|
| `git2` (vendored) | Git operations (clone, pull, push, branch, status, diff) |
| `portable-pty` | PTY sessions for embedded terminal |
| `keyring` | OS keychain access (macOS/Windows/Linux) |
| `dirs` | Platform-standard directories (~/, AppData, etc.) |

## Troubleshooting

### First `cargo check` is slow
Normal — downloads and compiles ~490 crates. Subsequent builds use cache (~30s).

### `frontendDist` path not found
Run `cd frontend && NEXT_TAURI=true pnpm build` first to generate `frontend/out/`.

### Linux missing webkit2gtk
```bash
sudo apt install libwebkit2gtk-4.1-dev  # Note: 4.1, not 4.0
```

### Windows WebView2 missing
Download from [developer.microsoft.com/en-us/microsoft-edge/webview2/](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). Usually pre-installed on Windows 10/11.

### macOS sidecar not signed
Without Apple Developer credentials, the unsigned sidecar triggers Gatekeeper. For local dev:
```bash
xattr -cr tauri-app/src-tauri/binaries/pilot-cli-aarch64-apple-darwin
```

### `pilot implement` fails in dev
The sidecar binary in `binaries/` is an empty stub during development. Build it locally:
```bash
cd cli && uv run pyinstaller pilot.spec --noconfirm
cp dist/pilot-cli/pilot-cli ../tauri-app/src-tauri/binaries/pilot-cli-aarch64-apple-darwin
```
