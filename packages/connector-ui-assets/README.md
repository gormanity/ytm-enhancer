# Connector UI Assets

Shared connector UI artwork lives here so native connector apps do not drift.

`playback/` contains the canonical SVG playback controls used by connector
surfaces. Platform targets may need local resource copies when their build tools
require target-local assets, but tests must verify those copies match these
canonical files.
