import { resolve } from "node:path";

import { defineConfig } from "vite";

const rootDirectory = import.meta.dirname;

export default defineConfig(({ mode }) => {
  const isContentBuild = mode === "content";
  const isPopupBuild = mode === "popup";
  const input = isContentBuild
    ? resolve(rootDirectory, "src/content/index.ts")
    : isPopupBuild
      ? resolve(rootDirectory, "src/ui/popup.html")
      : resolve(rootDirectory, "src/background/index.ts");

  return {
    // Build the popup from its own directory so MV3's
    // `action.default_popup: "popup.html"` resolves at the extension root.
    root: isPopupBuild ? resolve(rootDirectory, "src/ui") : rootDirectory,
    publicDir: resolve(rootDirectory, "public"),
    build: {
      copyPublicDir: true,
      emptyOutDir: isContentBuild,
      outDir: resolve(rootDirectory, "dist"),
      // Production extension bundles must not expose source maps.
      sourcemap: false,
      target: "chrome131",
      minify: false,
      rollupOptions: {
        input,
        output: {
          entryFileNames: isContentBuild
            ? "content.js"
            : isPopupBuild
              ? "assets/[name]-[hash].js"
              : "background.js",
          format: isContentBuild ? "iife" : "es",
          inlineDynamicImports: !isPopupBuild,
        },
      },
    },
  };
});
