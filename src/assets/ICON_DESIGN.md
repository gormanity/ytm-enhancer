# Icon Design

YTM Enhancer's icon should stay close enough to YouTube Music that users can
recognize the product context quickly, while still feeling like a richer and
more featureful experience than stock YouTube Music.

## Principles

- Keep the icon evocative of YouTube Music without copying the YouTube Music app
  icon.
- Favor a premium, extension-specific mark over a generic media-control symbol.
- Preserve enough internal detail that the icon feels active and musical at
  popup, toolbar, store, and macOS menu bar sizes.
- Design the base icon so it can support state variants without changing the
  core silhouette.
- Use an outer-ring treatment for active playback so the base mark remains
  recognizable and does not need to be squished, hidden, or redrawn.
- Keep monochrome menu bar variants structurally aligned with the extension icon
  so the menu bar app and browser extension feel like one product.

## Current State Variants

- Idle: the base icon from `icon.svg`, including the internal spokes.
- Playing: the base icon plus a generated outer ring.
- Disabled: the base icon rendered in grayscale for suppressed or unavailable
  extension states.

Future icon iterations should update the generated browser icons and the menu
bar resources together so active playback reads consistently across surfaces.
