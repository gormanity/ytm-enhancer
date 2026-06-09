# Menu Bar Connector

This directory is reserved for the first-party native menu bar connector.

The app is not implemented yet. It should depend on
`@ytm-enhancer/connector-protocol` and a transport adapter only. It must not
import from `src/`, inspect the YouTube Music DOM, or depend on extension module
internals.

Initial work should start after the connector transport is selected.
