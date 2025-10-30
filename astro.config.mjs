// @ts-check
import { defineConfig } from "astro/config";

import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite"; // Tailwind v4 plugin

export default defineConfig({
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
      },
    },
  },
});
