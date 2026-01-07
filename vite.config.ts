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
    target: 'es2020'
  },
  base: '/web/dist/'
})
