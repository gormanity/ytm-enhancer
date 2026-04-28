<p align="center">
  <img src="src/assets/icon.svg" alt="YTM Enhancer logo" width="180">
</p>

# YTM Enhancer

<p align="center">
  <a href="https://github.com/gormanity/ytm-enhancer/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/gormanity/ytm-enhancer/ci.yml?branch=main&label=CI">
  </a>
  <a href="https://github.com/gormanity/ytm-enhancer/releases">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/gormanity/ytm-enhancer?label=latest%20release">
  </a>
  <a href="LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/github/license/gormanity/ytm-enhancer">
  </a>
  <img alt="Browsers: Chrome, Edge, Firefox" src="https://img.shields.io/badge/Browsers-Chrome%20%7C%20Edge%20%7C%20Firefox-4B6BFB">
  <img alt="Privacy-first: no analytics" src="https://img.shields.io/badge/Privacy-No%20analytics-1F9D55">
</p>

YTM Enhancer supercharges YouTube Music to make it the best browser-based media
player.

It upgrades YouTube Music in your browser with smarter controls, automation, and
visual enhancements, without forcing you into a replacement app or wrapper.

If you love the ubiquity of YouTube Music's service but want a more
fully-featured listening experience, this extension is for you.

## Why YTM Enhancer

- Adds missing quality-of-life features from other media players
- Improves daily listening flow with fewer clicks and better controls
- Keep YouTube Music in your browser - without compromises
- Manage multiple YouTube Music tabs, effortlessly switching and controlling
  playback
- Private by design: no analytics, no tracking, and no external backend
  services.
- Supports all major browsers: Chrome, Edge, and Firefox

## Current Modules

| Feature                                                                                          | Why You Want It                                                                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| <img src="src/assets/module-icons/quick-settings.svg" width="18" alt="" /> **Playback Controls** | Control playback, switch tabs, and manage now playing from one panel.            |
| <img src="src/assets/module-icons/auto-play.svg" width="18" alt="" /> **Auto Play**              | Open YouTube Music and have playback start automatically when you are ready.     |
| <img src="src/assets/module-icons/auto-skip.svg" width="18" alt="" /> **Auto Skip Disliked**     | Automatically skip disliked tracks so your playlists stay great start to finish. |
| <img src="src/assets/module-icons/visualizer.svg" width="18" alt="" /> **Audio Visualizer**      | Add responsive visualizer overlays and tune the look to match your setup.        |
| <img src="src/assets/module-icons/hotkeys.svg" width="18" alt="" /> **Hotkeys**                  | Control playback from any app or jump back to YouTube Music instantly.           |
| <img src="src/assets/module-icons/mini-player.svg" width="18" alt="" /> **Mini Player**          | Keep controls and now playing visible in a compact PiP view while multitasking.  |
| <img src="src/assets/module-icons/notifications.svg" width="18" alt="" /> **Notifications**      | Get desktop updates on track changes and playback resumption with custom detail. |
| <img src="src/assets/module-icons/sleep-timer.svg" width="18" alt="" /> **Sleep Timer**          | Stop playback by duration or clock time so your queue does not run all night.    |

## Installation

YTM Enhancer currently installs from source (manual load). Browser web store
listings are coming soon.

### Prerequisites

- Node.js 20+
- pnpm 10+

### Chrome / Chromium (Chrome, Brave)

<details>
<summary>Show Chrome / Chromium installation steps</summary>

1. Clone this repository.
2. Install dependencies: `pnpm install`
3. Build Chrome output: `pnpm run build:chrome`
4. Open `chrome://extensions`.
5. Enable Developer mode.
6. Click "Load unpacked".
7. Select `dist/chrome`.

</details>

### Edge

<details>
<summary>Show Edge installation steps</summary>

1. Clone this repository.
2. Install dependencies: `pnpm install`
3. Build Edge output: `pnpm run build:edge`
4. Open `edge://extensions`.
5. Enable Developer mode.
6. Click "Load unpacked".
7. Select `dist/edge`.

</details>

### Firefox

<details>
<summary>Show Firefox installation steps</summary>

1. Clone this repository.
2. Install dependencies: `pnpm install`
3. Build Firefox output: `pnpm run build:firefox`
4. Open `about:debugging#/runtime/this-firefox`.
5. Click "Load Temporary Add-on".
6. Select any file inside `dist/firefox` (typically `manifest.json`).

</details>

### Browser Compatibility Notes

Mini Player depends on the experimental
[Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API).
MDN lists experimental Firefox support beginning in Firefox 151. Firefox users
must enable `dom.documentpip.enabled` from `about:config` before Mini Player is
available.

## Privacy

YTM Enhancer is private by design. It has no analytics, no tracking, and no
external backend services.

### Why Each Permission Is Required

| Permission                            | Why It Is Needed                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                           | Lets the popup and hotkeys interact with your currently active YouTube Music tab when you trigger extension actions. |
| `alarms`                              | Powers time-based automation, including Sleep Timer and background scheduling logic.                                 |
| `notifications`                       | Shows native desktop notifications for track changes and related playback events.                                    |
| `scripting`                           | Injects and runs extension scripts on YouTube Music to provide feature behavior in-page.                             |
| `storage`                             | Saves your module settings locally in the browser so preferences persist.                                            |
| `https://music.youtube.com/*`         | Limits extension functionality to YouTube Music pages where features are intended to run.                            |
| `https://lh3.googleusercontent.com/*` | Loads album art assets used for now-playing and notification UI.                                                     |

See [PRIVACY.md](PRIVACY.md) for full details on data handling, permissions, and
privacy guarantees.

## Development

YTM Enhancer is actively developed and already includes a broad module set.

The architecture is designed so new features can be added as modules without
rewriting existing modules.

### Contributing

Contributions are encouraged.

If you want to help:

- Open an issue for bugs, UX problems, or feature requests.
- Open a PR for fixes and improvements.

See [CONTRIBUTING.md](/CONTRIBUTING.md) for details on the module contribution
workflow.

### Development Builds

- Chrome watch build: `pnpm run dev:chrome`
- Edge watch build: `pnpm run dev:edge`
- Firefox watch build: `pnpm run dev:firefox`

### License

MIT. See [LICENSE](LICENSE).
