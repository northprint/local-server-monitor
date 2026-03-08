import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': '/src/shared'
      }
    }
  },
  preload: {
    // Do NOT externalize deps so contextBridge works in sandboxed renderer
    plugins: [],
    resolve: {
      alias: {
        '@shared': '/src/shared'
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': '/src/shared'
      }
    }
  }
})
