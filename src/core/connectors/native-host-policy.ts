interface ConnectorEnablement {
  enabled: boolean;
}

export function isNativeHostBusyError(message: string | null): boolean {
  return /already connected to|another browser/i.test(message ?? "");
}

export function isNativeHostExitError(message: string | null): boolean {
  return /native host (has )?exited|native host.*disconnected|native messaging host.*disconnected/i.test(
    message ?? "",
  );
}

export function isNativeHostConnectorEnabled(
  connectors: ReadonlyMap<string, ConnectorEnablement>,
  connectorId: string,
): boolean {
  return connectors.get(connectorId)?.enabled !== false;
}
