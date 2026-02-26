import {
  createExtensionContext,
  initializeModules,
  type FeatureModule,
} from "@/core";

const context = createExtensionContext();

// Modules will be imported and registered here as they are built.
const modules: FeatureModule[] = [];

initializeModules(context, modules).catch((err) => {
  console.error("[YTM Enhancer] Failed to initialize modules:", err);
});
