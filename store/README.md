# Store Submission Assets

This directory keeps browser store submission content under version control.

## Structure

- `store/STORE.md`: shared listing copy and metadata for all stores
- `store/screenshots/*.html`: source files for shared screenshots and promo
  images
- `store/screenshots/*.png`: tracked rendered assets for review and submission
- `dist/store-assets/STORE.md`: canonical copy and submission metadata
- `dist/store-assets/short-description.txt`: paste-ready shared summary
- `dist/store-assets/description.txt`: paste-ready Chrome and Edge description
- `dist/store-assets/firefox-description.md`: paste-ready AMO description
- `dist/store-assets/*.png`: generated submission images
- `dist/edge/icon300.png`: generated 300x300 icon export for Edge Add-ons

## Workflow

1. Update `store/STORE.md` for the release.
2. Add or refresh screenshot and promo HTML sources in `store/screenshots/`.
3. Run `pnpm run build:store` to refresh the tracked PNGs and generate
   `dist/store-assets/`.
4. Paste `short-description.txt` into each browser store. Use `description.txt`
   for Chrome and Edge, and `firefox-description.md` for Firefox AMO. The AMO
   version uses only bold text and unordered lists from Firefox's supported
   Markdown subset.
5. Use `https://gormanity.github.io/ytm-enhancer/` as the Homepage or Website
   URL. Do not add URLs or cross-store links to the public descriptions.
6. Keep privacy and support links aligned with `README.md` and `PRIVACY.md`.
7. Build the browser package(s) so generated store assets are up to date.
8. In the Chrome Web Store dashboard, open **Privacy practices** and enter the
   permission justifications from `store/STORE.md`, including the
   `nativeMessaging` justification.
9. Submit browser-specific builds to matching stores:
   - Chrome -> `ytm-enhancer-<version>-chrome.zip`
   - Edge -> `ytm-enhancer-<version>-edge.zip`
   - Firefox -> `ytm-enhancer-<version>-firefox.zip`

On macOS, copy a generated field directly to the clipboard:

```sh
pbcopy < dist/store-assets/short-description.txt
pbcopy < dist/store-assets/description.txt
pbcopy < dist/store-assets/firefox-description.md
```

## Screenshot Submission Order

The gallery should lead with the extension's broadest everyday benefits before
moving into visual customization and optional Connected Apps.

### Chrome and Edge screenshot order

1. `01-playback-controls.png`
2. `02-mini-player.png`
3. `04-sleep-timer.png`
4. `03-visualizer.png`
5. `05-connected-apps.png`

### Firefox screenshot order

1. `01-playback-controls.png`
2. `04-sleep-timer.png`
3. `03-visualizer.png`
4. `05-connected-apps.png`

Omit `02-mini-player.png` from Firefox Add-ons because it depicts the full
Document Picture-in-Picture Mini Player, which may require experimental browser
support in Firefox. The Firefox listing copy already describes the Mini Player
as available where supported.
