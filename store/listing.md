# Store Listing

Canonical store listing content for Chrome Web Store, Edge Add-ons, and Firefox Add-ons.

This document is the default source for store copy and submission metadata.
Use the shared sections unless a browser-specific requirement forces different copy.

## Shared Listing Copy

### Detailed Description

YTM Enhancer upgrades YouTube Music in your browser with smarter controls,
automation, and visual enhancements, without forcing you into a replacement app
or wrapper.

If you love YouTube Music but want a more fully featured browser listening
experience, this extension is for you.

### Key Features

- Quick Settings: one panel for playback control, tab switching, and now playing details
- Autoplay: optionally start playback automatically when YouTube Music loads
- Auto Skip Disliked: automatically skip disliked tracks when they appear
- Audio Visualizer: configurable visualizer overlays
- Hotkeys: playback and focus shortcuts
- Mini Player: compact Picture-in-Picture controls while multitasking
- Notifications: track-change and playback-resumed desktop notifications
- Sleep Timer: stop playback by duration or clock time

### Open Source and Privacy Positioning

YTM Enhancer is open source and private by design:

- no analytics
- no tracking
- no external backend services

Repository:
`https://github.com/gormanity/ytm-enhancer`

---

## Shared Links and Privacy

### Homepage URL

`https://github.com/gormanity/ytm-enhancer`

### Support URL

`https://github.com/gormanity/ytm-enhancer/issues`

### Privacy Policy

Source of truth:
`../PRIVACY.md`

Public URL:
`https://github.com/gormanity/ytm-enhancer/blob/main/PRIVACY.md`

---

## Chrome Web Store

### Category

`Entertainment`

### Single Purpose Statement

YTM Enhancer enhances the YouTube Music web app on `music.youtube.com` by adding
optional playback controls, automation features, and interface improvements for
the browser listening experience.

---

## Edge Add-ons

### Category

`Entertainment`

### Search Terms

- youtube music
- ytm
- music player
- music controls
- media player
- picture in picture
- streaming

---

## Firefox Add-ons

### Categories

- Photos, Music & Videos
- Appearance
- Tabs

### Source Code Requirement

Firefox Add-ons may require source code when the uploaded package contains
compiled or minified files.

For each Firefox submission, prepare:

#### Source Code URL

`https://github.com/gormanity/ytm-enhancer/tree/v<version>`

#### Source Archive

`https://github.com/gormanity/ytm-enhancer/archive/refs/tags/v<version>.tar.gz`

#### Build Instructions

- `pnpm install`
- `pnpm run build:firefox`

#### Upload Artifact

`releases/ytm-enhancer-<version>-firefox.zip`

Keep submitted source aligned with the exact release commit and version.

---

## 6. Reviewer Notes

This add-on only runs on `https://music.youtube.com/*` and enhances the existing
YouTube Music web app in-page.

### Reviewer Verification

- Open YouTube Music in a tab before testing the popup or features.
- Some features are browser-dependent by design.
- In Firefox, Chromium-only Picture-in-Picture capabilities are not available,
  and the extension degrades gracefully.
- The add-on does not use remote code, external services, analytics, or tracking.
- No extension-specific accounts, authentication, or test credentials are required.

Reviewers can test using their own normal YouTube Music session.

---

## 7. Release Checklist

Use this checklist when publishing a new version.

- update any changed listing copy
- verify homepage, support, and privacy links
- verify Chrome single purpose statement still matches functionality
- verify Edge search terms are still appropriate
- verify Firefox categories and reviewer notes are still accurate
- prepare Firefox source code URL and source archive for the exact tag
- confirm release artifact names match the current build output
