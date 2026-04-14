import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    dts({ include: ['src'] }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'slipstream',
      formats: ['es', 'umd'],
      fileName: (format) => `slipstream.${format}.js`,
    },
    rollupOptions: {
      // Lit is small enough to bundle in — no need to mark as external
      // for a drop-in script tag library
    },
  },
})
