import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// The ported source (originally CRA/craco) uses plain .js extensions for
// files that contain JSX. Vite's default esbuild loader only applies the
// JSX transform to .jsx/.tsx — without this override, every page/component
// using .js would fail to parse.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})
