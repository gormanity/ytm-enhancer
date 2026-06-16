# Release Strategy

YTM Enhancer is now a multi-product repository. The browser extension and
first-party connectors share source control, but they ship as independent
products with different distribution channels and release cadence.

## Products

Browser extension:

- Tag format: `vX.Y.Z`.
- Version source: root `package.json`.
- Release workflow: `.github/workflows/release.yml`.
- Distribution: browser store packages and GitHub release assets.
- GitHub Releases: owns the repository-wide latest release badge.

YTM Menu Bar:

- Tag format: `menu-bar-vX.Y.Z`.
- Version source: `apps/menu-bar/release/metadata.json`.
- Release workflow: `.github/workflows/menu-bar-release.yml`.
- Distribution: direct `.pkg`, Sparkle appcast, and Homebrew cask.
- GitHub Releases: component-scoped artifact pages only.

## Tag Policy

Use component-scoped tags whenever a product can release independently:

```text
vX.Y.Z              browser extension
menu-bar-vX.Y.Z     YTM Menu Bar connector
future-app-vX.Y.Z   future independently shipped app
```

Do not use one shared repository version unless every shipped product releases
together and has the same update path. That is not true for this repository.

## Latest Release Policy

GitHub exposes a single repository-wide latest release. That is useful for
repositories with one primary product, but it is ambiguous for multi-product
repositories.

For this repository:

- Extension releases set `make_latest: true`.
- Menu bar releases set `make_latest: false`.
- Connector users find current versions through component-specific surfaces.
- Generated release notes compare against the previous tag for the same
  component, not the previous repository tag.

This keeps the repository latest badge meaningful for the primary browser
extension while preserving independent connector releases.

## Discovery

Human-facing discovery should be component-specific:

- Extension users should use browser stores and extension release notes.
- Menu bar users should use
  `https://gormanity.github.io/ytm-enhancer/menu-bar/install.html`.
- Developers should use `docs/menu-bar-release.md` and component READMEs.

Automated discovery should use native channel mechanisms:

- Sparkle uses `menu-bar/appcast.xml`.
- Homebrew uses the generated cask in `gormanity/homebrew-tap`.
- Browser stores own browser extension updates.
- Component-aware tooling can read
  `https://gormanity.github.io/ytm-enhancer/releases.json`.

GitHub Releases host artifacts and release notes. They are not the source of
truth for every product's latest version.

## Release Index

The menu bar release workflow publishes a machine-readable release index on
GitHub Pages:

```text
https://gormanity.github.io/ytm-enhancer/releases.json
```

The index lists products independently so consumers do not need to infer product
identity from GitHub's repository-wide latest release. It is informational and
does not replace Sparkle, Homebrew, or browser store update mechanisms.
