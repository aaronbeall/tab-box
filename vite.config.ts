import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build the side panel app located under web/
// Set base to /web/dist/ so asset paths resolve correctly in the extension
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'web/dist'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'web/index.html'),
        background: path.resolve(__dirname, 'background.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // background.ts should output as background.js without hash
          if (chunkInfo.name === 'background') {
            return 'background.js'
          }
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  base: '/web/dist/'
})
