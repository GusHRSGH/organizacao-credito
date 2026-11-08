/// <reference types="vite/client" />

interface Window {
  desktopAuth?: {
    redirectUrl: string
    consumeCallback: () => Promise<string | null>
    onCallback: (callback: (url: string) => void) => () => void
  }
}
