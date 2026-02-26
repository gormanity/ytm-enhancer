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
// synchronously at the top level. Register before any async work.
hotkeys.registerListeners();

const modules: FeatureModule[] = [hotkeys];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});
