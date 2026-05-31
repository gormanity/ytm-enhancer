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
- Keeps YouTube Music in your browser without replacing the native app
- Manage multiple YouTube Music tabs, effortlessly switching and controlling
  playback
- Private by design: no analytics, no tracking, and no external backend
  services.
- Supports all major browsers: Chrome, Edge, and Firefox

## Install

Install YTM Enhancer from your browser's extension store:

| Browser | Store                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| Chrome  | [Chrome Web Store](https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp)                |
| Edge    | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ytm-enhancer/gamefnibdabclmkngggcjghpbhjmajkm) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/)                                           |

## Feature Highlights

| Feature                                                                                             | Why You Want It                                                                                                         |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| <img src="src/assets/module-icons/playback-controls.svg" width="18" alt="" /> **Playback Controls** | Control playback, switch YTM tabs, seek, adjust volume, change speed/quality, and toggle shuffle/repeat from one panel. |
| <img src="src/assets/module-icons/auto-play.svg" width="18" alt="" /> **Auto Play**                 | Open YouTube Music and have playback start automatically when browser policy allows it.                                 |
| <img src="src/assets/module-icons/auto-skip.svg" width="18" alt="" /> **Auto Skip Disliked**        | Automatically skip disliked tracks so your playlists stay great start to finish.                                        |
| <img src="src/assets/module-icons/visualizer.svg" width="18" alt="" /> **Audio Visualizer**         | Add responsive visualizer overlays and tune style, color, surface, and intensity.                                       |
| <img src="src/assets/module-icons/hotkeys.svg" width="18" alt="" /> **Hotkeys**                     | Control playback, focus YouTube Music, or trigger module actions from any app.                                          |
| <img src="src/assets/module-icons/mini-player.svg" width="18" alt="" /> **Mini Player**             | Open a compact Picture-in-Picture control window while multitasking.                                                    |
| <img src="src/assets/module-icons/notifications.svg" width="18" alt="" /> **Notifications**         | Get desktop updates on track changes and playback resumption with custom detail.                                        |
| <img src="src/assets/module-icons/sleep-timer.svg" width="18" alt="" /> **Sleep Timer**             | Stop playback by duration or clock time so your queue does not run all night.                                           |
| <img src="src/assets/module-icons/about.svg" width="18" alt="" /> **About**                         | Find version details, support links, privacy information, and store pages.                                              |

## Browser Compatibility Notes

Mini Player's extension PiP window depends on the experimental
[Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API).
When that API is unavailable, YTM Enhancer disables the extension PiP controls
or falls back to native video PiP where practical.

Firefox users may need to enable `dom.documentpip.enabled` from `about:config`
before the full Mini Player experience is available.

## Manual Developer Load

Use manual loading when developing or testing a local build.

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

YTM Enhancer is built as a modular WebExtension. New feature work should live in
module-owned code and use the shared runtime APIs and popup UI helpers.

Start with:

- [PROJECT.md](PROJECT.md) for project architecture, scope, and design
  principles
- [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow
- [docs/module-api.md](docs/module-api.md) for module runtime APIs
- [docs/shared-ui.md](docs/shared-ui.md) for popup bindings and shared UI
  components
- [docs/hotkeys.md](docs/hotkeys.md) for module-owned shortcut registration

### Common Commands

| Task                          | Command              |
| ----------------------------- | -------------------- |
| Install dependencies          | `pnpm install`       |
| Format                        | `pnpm run format`    |
| Lint                          | `pnpm run lint`      |
| Typecheck                     | `pnpm run typecheck` |
| Test                          | `pnpm run test`      |
| CI-equivalent check           | `pnpm run check`     |
| Dev build for local optesting | `pnpm run dev:build` |
| Production build              | `pnpm run build`     |
| Package store zips            | `pnpm run package`   |

### Watch Builds

- Chrome watch build: `pnpm run dev:chrome`
- Edge watch build: `pnpm run dev:edge`
- Firefox watch build: `pnpm run dev:firefox`

### Contributing

Contributions are encouraged. Open an issue for bugs, UX problems, or feature
requests, or open a focused PR with tests and verification notes.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on the module contribution
workflow.

## License

MIT. See [LICENSE](LICENSE).
