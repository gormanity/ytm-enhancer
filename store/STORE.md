# Store Listing

Canonical store listing content for Chrome Web Store, Edge Add-ons, and Firefox
Add-ons.

This document is the default source for store copy and submission metadata. Use
the shared sections unless a browser-specific requirement forces different copy.

## Shared Listing Copy

### Detailed Description

YTM Enhancer supercharges YouTube Music to make it the best browser-based media
player.

It upgrades YouTube Music in your browser with smarter controls, automation, and
visual enhancements, without forcing you into a replacement app or wrapper.

If you love the ubiquity of YouTube Music's service but want a more
fully-featured listening experience, this extension is for you.

### Key Features

- Playback Controls: control playback, switch YouTube Music tabs, seek, adjust
  volume, change speed/quality, and toggle shuffle/repeat from one panel
- Auto Play: optionally start playback automatically when YouTube Music loads
- Auto Skip Disliked: automatically skip disliked tracks when they appear
- Audio Visualizer: configurable visualizer overlays
- Hotkeys: playback, tab focus, and module action shortcuts
- Mini Player: compact extension Picture-in-Picture control window while
  multitasking
- Notifications: track-change and playback-resumed desktop notifications
- Sleep Timer: stop playback by duration or clock time

### Open Source and Privacy Positioning

YTM Enhancer is open source and private by design:

- no analytics
- no tracking
- no external backend services

Repository: `https://github.com/gormanity/ytm-enhancer`

---

## Shared Links and Privacy

### Homepage URL

`https://github.com/gormanity/ytm-enhancer`

### Support URL

`https://github.com/gormanity/ytm-enhancer/issues`

### Privacy Policy

Source of truth: `../PRIVACY.md`

Public URL: `https://github.com/gormanity/ytm-enhancer/blob/main/PRIVACY.md`

---

## Chrome Web Store

### Category

`Entertainment`

### Single Purpose Statement

YTM Enhancer enhances the YouTube Music web app on `music.youtube.com` by adding
optional playback controls, tab switching, automation, notifications, keyboard
shortcuts, Picture-in-Picture controls, and interface improvements for the
browser listening experience.

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

### Privacy Section

#### Single Purpose Description

YTM Enhancer enhances the YouTube Music web app on `music.youtube.com` with
optional playback controls, tab switching, automation, notifications, keyboard
shortcuts, Picture-in-Picture controls, and interface improvements.

#### Permission Justification

##### `activeTab`

Used to identify and interact with the active YouTube Music tab when the user
opens the extension popup or triggers a command.

##### `alarms`

Used by the Sleep Timer feature to stop playback after a user-selected duration
or clock time.

##### `notifications`

Used to show optional desktop notifications for track changes, playback resume
reminders, and the "remind me" shortcut.

##### `scripting`

Used to inject extension scripts into YouTube Music tabs so user-enabled
features can control playback and read current playback state.

##### `storage`

Used to save user preferences, module settings, shortcut configuration, and
feature state locally in the browser.

#### Host Permission Justification

`https://music.youtube.com/*` is required because the extension only operates on
the YouTube Music web app. It reads playback state and applies user-enabled
controls and UI enhancements on that site.

`https://lh3.googleusercontent.com/*` is required to display YouTube Music album
artwork served from Google's image host in extension UI surfaces such as the
popup and Mini Player.

#### Remote Code

No.

#### Remote Code Justification

YTM Enhancer does not load or execute remote code. All executable JavaScript,
CSS, HTML, and extension assets are packaged with the extension. The extension
may display media metadata or artwork from YouTube Music/Google image URLs, but
those resources are not executed as code.

---

## Firefox Add-ons

### Categories

- Photos, Music & Videos
- Appearance
- Tabs

### Tags

- youtube
- music
- streaming

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

## Reviewer Notes

This add-on only runs on `https://music.youtube.com/*` and enhances the existing
YouTube Music web app in-page.

### Reviewer Verification

- Open YouTube Music in a tab before testing the popup or features.
- Some features are browser-dependent by design.
- In Firefox, Chromium-only Picture-in-Picture capabilities are not available,
  and the extension degrades gracefully.
- The add-on does not use remote code, external services, analytics, or
  tracking.
- No extension-specific accounts, authentication, or test credentials are
  required.

Reviewers can test using their own normal YouTube Music session.

### Firefox AMO Developer Comments

Bug reports and feature requests:
https://github.com/gormanity/ytm-enhancer/issues

Known limitations:

- This add-on works only on https://music.youtube.com/*
- Some Picture-in-Picture behavior differs in Firefox because certain
  Chromium-only APIs are not available

---

## Release Checklist

Use this checklist when publishing a new version.

- update any changed listing copy
- verify homepage, support, and privacy links
- verify Chrome single purpose statement still matches functionality
- verify Edge search terms are still appropriate
- verify Edge privacy section permission justifications still match the manifest
- verify Firefox categories and reviewer notes are still accurate
- prepare Firefox source code URL and source archive for the exact tag
- confirm release artifact names match the current build output
