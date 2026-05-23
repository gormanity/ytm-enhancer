import { bindRange } from "./bind-range";
import { bindSelect } from "./bind-select";
import { bindToggle } from "./bind-toggle";

export interface ModuleControlBinding<TValue> {
  getType: string;
  setType: string;
  setKey?: string;
  parseData?: (data: unknown) => TValue;
  transformValue?: (value: TValue) => unknown;
}

export interface ModuleRangeBinding extends ModuleControlBinding<number> {
  label: string;
  min?: number;
  max?: number;
  unit?: string;
  onLoaded?: (range: HTMLInputElement) => void;
}

export interface ModuleSelectBinding extends ModuleControlBinding<string> {
  onLoaded?: (select: HTMLSelectElement) => void;
}

export function bindModuleToggle(
  container: HTMLElement,
  dataRole: string,
  options: Pick<ModuleControlBinding<boolean>, "getType" | "setType">,
): void {
  bindToggle(container, dataRole, options);
}

export function bindModuleSelect(
  container: HTMLElement,
  dataRole: string,
  options: ModuleSelectBinding,
): void {
  bindSelect(container, dataRole, options);
}

export function bindModuleRange(
  container: HTMLElement,
  dataRole: string,
  options: ModuleRangeBinding,
): void {
  bindRange(container, dataRole, options);
}

export function createStatusMessage(options: {
  tone: "info" | "warning" | "error";
  text: string;
}): HTMLElement {
  const status = document.createElement("p");
  status.classList.add(
    "module-status-message",
    `module-status-message-${options.tone}`,
  );
  status.textContent = options.text;
  return status;
}

export function createActionRow(options: {
  label: string;
  buttonLabel: string;
  onClick: () => void | Promise<void>;
}): HTMLElement {
  const row = document.createElement("div");
  row.classList.add("card-row", "module-action-row");

  const label = document.createElement("span");
  label.textContent = options.label;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = options.buttonLabel;

  button.addEventListener("click", () => {
    button.disabled = true;
    Promise.resolve(options.onClick()).finally(() => {
      button.disabled = false;
    });
  });

  row.append(label, button);
  return row;
}
