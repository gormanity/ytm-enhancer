# Store Submission Assets

This directory keeps browser store submission content under version control.

## Structure

- `store/listing.md`: shared listing copy and metadata for all stores
- `store/screenshots/`: shared screenshots used across stores
- `dist/edge/icon300.png`: generated 300x300 icon export for Edge Add-ons

## Workflow

1. Update `store/listing.md` for the release.
2. Add or refresh screenshots in `store/screenshots/`.
3. Keep privacy and support links aligned with `README.md` and `PRIVACY.md`.
4. Build the browser package(s) so generated store assets are up to date.
5. Submit browser-specific builds to matching stores:
   - Chrome -> `ytm-enhancer-<version>-chrome.zip`
   - Edge -> `ytm-enhancer-<version>-edge.zip`
   - Firefox -> `ytm-enhancer-<version>-firefox.zip`

If we later need browser-specific store text, we will add explicit overrides in
a follow-up change.
