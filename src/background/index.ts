import {
  createExtensionContext,
  createMessageSender,
  initializeModules,
  type FeatureModule,
} from "@/core";
import { HotkeysModule } from "@/modules/hotkeys";

const context = createExtensionContext();
const send = createMessageSender();

const modules: FeatureModule[] = [new HotkeysModule(send)];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});
