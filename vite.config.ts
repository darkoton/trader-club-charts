import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), svgr()],
  server: {
    host: true, // listen on 0.0.0.0 — accessible from other devices on the LAN
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep only the admin shell together; heavy admin sub-pages are
          // dynamically imported in AdminPage and must be allowed to split
          // into their own per-tab chunks (do NOT force all Admin* here).
          if (id.includes('src/components/AdminPage') || id.includes('src/components/AdminPanel')) {
            return 'chunk-admin-app';
          }
          if (id.includes('src/tma/')) {
            return 'chunk-tma';
          }
          if (id.includes('src/pages/auth/')) {
            return 'chunk-auth-pages';
          }
          if (id.includes('src/pages/blog/') || id.includes('src/pages/home/') || id.includes('src/pages/legal/')) {
            return 'chunk-public-pages';
          }

          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query';
          }
          if (id.includes('node_modules/socket.io-client') || id.includes('node_modules/engine.io-client') || id.includes('node_modules/@socket.io/')) {
            return 'vendor-socket';
          }
          if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/') || id.includes('node_modules/material-react-table')) {
            return 'vendor-mui-admin';
          }
          if (id.includes('node_modules/react-hook-form')) {
            return 'vendor-forms';
          }
          if (id.includes('node_modules/@tiptap/')) {
            return 'vendor-editor';
          }
          if (id.includes('node_modules/lightweight-charts')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/react-router-dom')) {
            return 'vendor-router';
          }
        },
      },
    },
  },
});
