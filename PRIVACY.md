# Privacy Policy

Last updated: March 8, 2026

YTM Enhancer is built with a privacy-first model:

- No analytics
- No tracking
- No external backend services
- No data sale or data sharing for advertising

## Data Collection

YTM Enhancer does not collect personal data for the developer.

The extension does not send your listening history, account data, or usage
metrics to external services controlled by this project.

YTM Enhancer also does not collect telemetry, crash reporting, diagnostics,
advertising IDs, or behavioral analytics.

## Local Data Storage

YTM Enhancer stores feature settings locally in your browser using extension
storage APIs. This data stays on your device (or in your browser profile's own
sync mechanisms, if you enable browser sync).

Stored data is limited to configuration needed for extension functionality, such
as module preferences and UI options.

### Examples of Stored Settings

Depending on which modules you enable, locally stored settings may include:

- Toggle states (enabled/disabled) for modules
- Sleep Timer preferences (duration/time defaults)
- Notification field visibility preferences
- Audio Visualizer style/configuration options
- Playback Controls and popup view preferences

YTM Enhancer does not store your Google account password, payment data, or full
YouTube Music history for the developer.

## Data Retention and Deletion

- Data is retained only as long as it remains in your browser profile storage.
- Removing extension data in browser settings deletes extension-managed data.
- Uninstalling the extension removes locally stored extension data for that
  profile.
- If browser sync is enabled, synchronized extension settings are managed by
  your browser account's sync behavior.

## Network Access

YTM Enhancer is scoped to YouTube Music and related artwork resources:

- `https://music.youtube.com/*`
- `https://lh3.googleusercontent.com/*`

No project-operated servers are contacted.

## What Is Never Transmitted Off-Device

YTM Enhancer does not transmit the following to project infrastructure because
no project infrastructure for data collection exists:

- Track history archives
- Playlist libraries
- Authentication credentials
- Personally identifying account details
- Per-user analytics profiles

## Permissions and Purpose

- `activeTab` used to run extension actions against the active YouTube Music tab
  when you interact with the popup or hotkeys.
- `alarms` used for scheduled/background tasks, including Sleep Timer behavior.
- `notifications` used to show native desktop notifications for track and
  playback events.
- `scripting` used to inject extension scripts on YouTube Music pages so
  features can work in-page.
- `storage` used to save module settings and preferences in browser extension
  storage.
- `https://music.youtube.com/*` Host access required for YouTube Music feature
  integration.
- `https://lh3.googleusercontent.com/*` Host access required for artwork/cover
  image retrieval used in extension UI.

## Browser Sync Caveat

If you enable browser sync for extensions, some stored settings may be synced by
your browser vendor (for example, Chrome, Edge, or Firefox account sync). That
sync behavior is controlled by your browser and account settings, not by YTM
Enhancer servers.

## Third Parties

YTM Enhancer does not integrate third-party analytics or advertising SDKs.

Any data shown by the extension (such as track metadata or artwork) comes from
YouTube Music and related Google-hosted resources needed for playback context.

## Changes To This Policy

If privacy behavior changes, this file will be updated and the new "Last
updated" date will reflect that change.
