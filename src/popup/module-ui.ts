import { bindRange } from "./bind-range";
import { bindSelect } from "./bind-select";
import { bindToggle } from "./bind-toggle";
import { createRangeSlider } from "@/ui/range-slider";

export interface ModuleControlBinding<TValue> {
  getType: string;
  setType: string;
  setKey?: string;
  parseData?: (data: unknown) => TValue;
  transformValue?: (value: TValue) => unknown;
}

export interface ModuleClientBinding<TValue> {
  get: () => TValue | Promise<TValue>;
  set: (value: TValue) => void | Promise<void>;
}

export interface ModuleRangeBinding extends ModuleControlBinding<number> {
  label: string;
  min?: number;
  max?: number;
  unit?: string;
  onLoaded?: (range: HTMLInputElement) => void;
}

export interface ModuleRangeClientBinding extends ModuleClientBinding<number> {
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
  options:
    | Pick<ModuleControlBinding<boolean>, "getType" | "setType">
    | ModuleClientBinding<boolean>,
): void {
  if ("get" in options) {
    const toggle = container.querySelector<HTMLInputElement>(
      `[data-role="${dataRole}"]`,
    );
    if (!toggle) return;
    toggle.disabled = true;
    Promise.resolve(options.get())
      .then((value) => {
        toggle.checked = value;
        toggle.disabled = false;
      })
      .catch(() => undefined);
    toggle.addEventListener("change", () => {
      void options.set(toggle.checked);
    });
    return;
  }

  bindToggle(container, dataRole, options);
}

export function bindModuleSelect(
  container: HTMLElement,
  dataRole: string,
  options: ModuleSelectBinding | ModuleClientBinding<string>,
): void {
  if ("get" in options) {
    const select = container.querySelector<HTMLSelectElement>(
      `[data-role="${dataRole}"]`,
    );
    if (!select) return;
    const placeholder =
      select.querySelector<HTMLOptionElement>('option[value=""]');
    select.disabled = true;
    Promise.resolve(options.get())
      .then((value) => {
        select.value = value;
        select.disabled = false;
        placeholder?.remove();
      })
      .catch(() => undefined);
    select.addEventListener("change", () => {
      if (select.value) void options.set(select.value);
    });
    return;
  }

  bindSelect(container, dataRole, options);
}

export function bindModuleRange(
  container: HTMLElement,
  dataRole: string,
  options: ModuleRangeBinding | ModuleRangeClientBinding,
): void {
  if ("get" in options) {
    const slot = container.querySelector<HTMLElement>(
      `[data-role="${dataRole}"]`,
    );
    if (!slot) return;
    const min = options.min ?? (Number(slot.dataset.min) || 0);
    const max = options.max ?? (Number(slot.dataset.max) || 100);
    const slider = createRangeSlider({
      label: options.label,
      min,
      max,
      unit: options.unit,
      onInput(value) {
        void options.set(value);
      },
    });
    slider.setEnabled(false);
    slot.replaceChildren(slider.element);
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    if (!range) return;
    Promise.resolve(options.get())
      .then((value) => {
        slider.setValue(value);
        slider.setEnabled(true);
        options.onLoaded?.(range);
      })
      .catch(() => undefined);
    return;
  }

  bindRange(container, dataRole, options);
}

export function bindModuleActionButton(
  container: HTMLElement,
  dataRole: string,
  onClick: () => void | Promise<void>,
): void {
  const button = container.querySelector<HTMLButtonElement>(
    `[data-role="${dataRole}"]`,
  );
  if (!button) return;
  button.addEventListener("click", () => {
    button.disabled = true;
    Promise.resolve(onClick()).finally(() => {
      button.disabled = false;
    });
  });
}

export function bindModuleCheckboxGroup<TFields extends object>(
  container: HTMLElement,
  roles: Record<keyof TFields, string>,
  options: {
    get: () => TFields | Promise<TFields>;
    set: (fields: TFields) => void | Promise<void>;
  },
): void {
  const entries = Object.entries(roles).flatMap(([key, role]) => {
    const input = container.querySelector<HTMLInputElement>(
      `[data-role="${role}"]`,
    );
    if (!input) return [];
    input.disabled = true;
    return [{ key, input }];
  });

  Promise.resolve(options.get())
    .then((fields) => {
      for (const { key, input } of entries) {
        input.checked = fields[key as keyof TFields] === true;
        input.disabled = false;
      }
    })
    .catch(() => undefined);

  for (const { input } of entries) {
    input.addEventListener("change", () => {
      const fields = {} as TFields;
      for (const { key, input } of entries) {
        fields[key as keyof TFields] = input.checked as TFields[keyof TFields];
      }
      void options.set(fields);
    });
  }
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
