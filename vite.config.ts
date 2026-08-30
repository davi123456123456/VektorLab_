import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // il sito sta alla radice del dominio: nessun percorso relativo ereditato
  base: '/',
  server: { port: 5180 },
  build: { outDir: 'dist', sourcemap: false },
});
