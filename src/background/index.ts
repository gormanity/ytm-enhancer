import {
  createExtensionContext,
  createMessageSender,
  initializeModules,
  type FeatureModule,
} from "@/core";
import { HotkeysModule } from "@/modules/hotkeys";

const context = createExtensionContext();
const send = createMessageSender();
const hotkeys = new HotkeysModule(send);

// Chrome MV3 service workers require event listeners to be registered
// synchronously at the top level of the script, during the first turn
// of the event loop. Registering inside an async init() is too late.
chrome.commands.onCommand.addListener((command: string) => {
  void hotkeys.handleCommand(command);
});

const modules: FeatureModule[] = [hotkeys];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});
