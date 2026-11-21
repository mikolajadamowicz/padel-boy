/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  DEV: boolean
  PROD: boolean
  MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
/** Base URL for kluby.org requests; empty when the import is disabled. Set in vite.config.ts. */
declare const __KLUBY_PROXY_URL__: string
