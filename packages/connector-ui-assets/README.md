# Connector UI Assets

Shared connector UI artwork lives here so native connector apps do not drift.

`playback/` contains the canonical SVG playback controls used by connector
surfaces. Platform targets may need local resource copies when their build tools
require target-local assets, but tests must verify those copies match these
canonical files.

`actions/` contains shared menu and flyout action glyphs for connector surfaces
that cannot use a platform symbol library.

`status/` contains the shared monochrome app status icons used by the macOS menu
bar and Windows tray surfaces.

`demo-artwork/` contains deterministic release-demo thumbnails used by native
connector screenshot automation so promo captures do not depend on network
artwork availability.
