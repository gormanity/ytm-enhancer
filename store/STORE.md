# Store Listing

Canonical store listing content for Chrome Web Store, Edge Add-ons, and Firefox
Add-ons.

This document is the source for store copy and submission metadata. Use the
shared sections unless a browser-specific requirement forces different copy. Run
`pnpm run build:store` to generate paste-ready plain-text descriptions.

## Shared Listing Copy

### Short Description

Upgrade YouTube Music with smarter controls, automation, a mini player, and
optional Connected Apps (Beta).

### Detailed Description

Make YouTube Music work the way you listen.

YTM Enhancer adds precise playback controls and practical features directly to
the YouTube Music web app. Keep the service and library you already use, with no
separate YTM Enhancer account or replacement player required.

Control playback across YouTube Music tabs, seek within a track, fine-tune
volume and playback speed, choose stream quality, and manage shuffle and repeat.

### Key Features

- Playback Controls: Play, pause, skip, seek, adjust volume, speed, and quality,
  and manage shuffle and repeat across tabs.
- Automation: Start playback automatically and skip disliked tracks when you
  choose.
- Hotkeys: Control playback and trigger extension actions without opening the
  popup.
- Mini Player: Keep playback controls visible in a compact Picture-in-Picture
  window where supported.
- Sleep Timer: Stop playback after a duration or at a chosen time.
- Notifications: Get optional updates for track changes and playback-resumed
  reminders.
- Audio Visualizer: Add a configurable visualizer to the YouTube Music player.

### Connected Apps (Beta)

Want controls outside the browser? Optional, separately installed Connected Apps
bring now-playing details and playback controls to the macOS menu bar, Windows
system tray, and terminal. They are disabled by default and exchange now-playing
details and user-requested controls locally with the extension on your device.

### Private by Design

YTM Enhancer is open source and includes no analytics or tracking. It stores
settings in your browser profile and does not send your listening data to
project-operated servers.

---

## Shared Links and Privacy

### Homepage URL

`https://gormanity.github.io/ytm-enhancer/`

### Support URL

`https://github.com/gormanity/ytm-enhancer/issues`

### Privacy Policy

Source of truth: `../PRIVACY.md`

Public URL: `https://github.com/gormanity/ytm-enhancer/blob/main/PRIVACY.md`

### Description Link Policy

Do not put URLs or links to other browser stores in public descriptions. Use the
neutral landing page as the Homepage URL; it provides browser choices plus
Privacy, Support, and Source links.

---

## Chrome Web Store

### Category

`Entertainment`

### Single Purpose Statement

YTM Enhancer improves the YouTube Music web app at music.youtube.com with
user-controlled playback tools, automation, hotkeys, notifications,
Picture-in-Picture controls, visual customization, and optional local Connected
Apps (Beta).

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

YTM Enhancer improves the YouTube Music web app at music.youtube.com with
user-controlled playback tools, automation, hotkeys, notifications,
Picture-in-Picture controls, visual customization, and optional local Connected
Apps (Beta).

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

##### `nativeMessaging`

Used only when the optional Connected Apps (Beta) feature is enabled to exchange
playback state, track metadata, and user-requested playback or tab-focus
commands with enabled companion apps on your device. Native messaging is local
communication between the browser and app and does not route data through
project-operated servers.

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

#### `tabs` Permission

Firefox requires the explicit `tabs` permission to find existing YouTube Music
tabs, select the playback source, and open or focus YouTube Music when the user
invokes a control. YTM Enhancer does not use this permission to read unrelated
browsing history.

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
- The Connected Apps (Beta) feature is opt-in and disabled by default. Its
  native messaging permission supports the YTM Menu Bar, YTM Tray, and YTM
  Enhancer CLI companion apps on the user's device.
- Firefox's `tabs` permission is used only to find, select, open, or focus
  YouTube Music tabs in response to extension and Connected Apps controls.
- Some features are browser-dependent by design.
- In Firefox, Chromium-only Picture-in-Picture capabilities are not available,
  and the extension degrades gracefully.
- The add-on does not use remote code, project-operated services, analytics, or
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
- generate and review the paste-ready short and detailed descriptions
- confirm public descriptions contain no URLs or cross-store links
- verify homepage, support, and privacy links
- verify the Homepage URL is the neutral YTM Enhancer landing page
- verify Chrome single purpose statement still matches functionality
- verify Chrome Privacy practices permission justifications match the manifest,
  including `nativeMessaging`, before entering them in the dashboard
- verify Edge search terms are still appropriate
- verify Edge privacy section permission justifications still match the manifest
- verify Firefox categories and reviewer notes are still accurate
- prepare Firefox source code URL and source archive for the exact tag
- confirm release artifact names match the current build output
