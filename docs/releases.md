# Desktop releases


The **Desktop builds** GitHub Actions workflow builds:

| System | Architecture | Download |
| --- | --- | --- |
| macOS | Apple Silicon (arm64), Intel (x64) | `.dmg` |
| Windows | x64 | `.exe` installer |
| Linux | x64 | `.AppImage`, `.deb` |

Each build includes the local server, database migrations, and native AI runtime
for its platform. End users do not need Node.js or Postgres installed.
Windows ARM and Linux ARM installers are not currently built.

To test builds, push the workflow to GitHub, open **Actions → Desktop builds →
Run workflow**, and select the branch. Download installers from the completed
run's artifacts. No release is created for a manual run.

To release, update the versions in both `package.json` and
`desktop/package.json` (and their lockfiles), commit those changes, then tag the
commit. For example, after updating both packages and lockfiles to `0.1.1`:

```bash
git tag -a v0.1.1 -m "Inkshore Studio v0.1.1 — Preview"
git push origin v0.1.1
```

The workflow checks the tag against both package versions, runs TypeScript,
lint, and tests, builds on each target platform, and checks fresh local database
startup. Once all builds succeed, it creates a **draft GitHub Release** with
installers and `SHA256SUMS.txt`. Tags beginning with `v0.` and tags with a
prerelease suffix are marked as pre-releases and titled **Preview**. Review the downloads and publish the draft from
GitHub Releases so other people can download them. Reruns can update draft
assets; published releases require a new version tag.

GitHub's built-in `GITHUB_TOKEN` handles release uploads; no personal access token
is required. The workflow must be present on the tagged commit. Manual dispatch
may require first merging the workflow into the repository's default branch.

These builds are **unsigned**. macOS Gatekeeper and Windows SmartScreen can warn
or block installation. For broad distribution, add macOS Developer ID signing
and notarization, and Windows code signing. The workflow intentionally disables
automatic certificate discovery; remove that setting and configure signing when
certificates are available. Auto-update is not implemented.


### Desktop branding

The app and installers display **Inkshore Studio**, with a branded tide icon,
About/version information, documentation and issue links, and Windows Start Menu
and desktop shortcuts. Linux packages include desktop-menu metadata. The existing
legacy `inkdrop-studio-desktop` library folder is retained so existing local
projects remain available after the rebrand.

Platform icon assets live in `desktop/build/icons/`. To regenerate the ICNS, ICO,
and Linux PNG sizes from `icon.png` after updating the artwork:

```bash
npm ci --prefix desktop
node scripts/build-desktop-icons.mjs
```

The exporter uses electron-builder's icon toolset and may download it on first
run. Commit the exported assets so CI does not need to generate artwork. Download
names include the version, OS, and architecture, for example
`Inkshore-Studio-0.1.0-mac-arm64.dmg`.
