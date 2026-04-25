import { defineConfig } from "vite";
import { createConfig } from "./vite.config.shared";

export default defineConfig(({ mode }) => createConfig("firefox", mode));
