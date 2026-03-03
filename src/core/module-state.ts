const STORAGE_KEY = "moduleState";

type StateMap = Record<string, unknown>;

export async function loadModuleState(): Promise<StateMap> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StateMap) ?? {};
}

export async function saveModuleStateValue(
  key: string,
  value: unknown,
): Promise<void> {
  const current = await loadModuleState();
  current[key] = value;
  await chrome.storage.local.set({ [STORAGE_KEY]: current });
}
