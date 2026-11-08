/// <reference types="vite/client" />

interface GoogleStatus {
  configured: boolean
  signedIn: boolean
  email: string | null
  name: string | null
  picture: string | null
  lastBackupAt: string | null
}

interface Window {
  desktopGoogle?: {
    status: () => Promise<GoogleStatus>
    saveCredentials: (clientId: string, clientSecret: string) => Promise<GoogleStatus>
    forgetCredentials: () => Promise<GoogleStatus>
    signIn: () => Promise<GoogleStatus>
    cancelSignIn: () => Promise<GoogleStatus>
    signOut: () => Promise<GoogleStatus>
    backup: (text: string) => Promise<GoogleStatus>
    latest: () => Promise<{ modifiedTime: string; size: number } | null>
    restore: () => Promise<string>
  }
  desktopAuth?: {
    redirectUrl: string
    consumeCallback: () => Promise<string | null>
    onCallback: (callback: (url: string) => void) => () => void
  }
}
