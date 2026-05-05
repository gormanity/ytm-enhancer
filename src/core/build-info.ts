export function getBuildVersionLabel(version: string): string {
  return __DEV__ ? `v${version}-dev` : `v${version}`;
}

export function getBuildTimestampLabel(): string | null {
  if (!__DEV__) return null;

  const date = new Date(__BUILD_TIMESTAMP__);
  if (Number.isNaN(date.getTime())) {
    return `Built ${__BUILD_TIMESTAMP__}`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `Built ${year}-${month}-${day} ${hours}:${minutes}`;
}

export function isDevBuild(): boolean {
  return __DEV__;
}
