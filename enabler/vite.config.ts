import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "public"),
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "NuveiEnabler",
      fileName: (format) => `connector-enabler.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      output: {
        globals: {},
      },
    },
  },
});
