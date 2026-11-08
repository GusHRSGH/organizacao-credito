const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopAuth', {
  redirectUrl: 'organizacao-credito://auth/callback',
  consumeCallback: () => ipcRenderer.invoke('auth:consume-callback'),
  onCallback: (callback) => {
    const listener = (_event, url) => callback(url)
    ipcRenderer.on('auth:callback', listener)
    return () => ipcRenderer.removeListener('auth:callback', listener)
  },
})

contextBridge.exposeInMainWorld('desktopGoogle', {
  status: () => ipcRenderer.invoke('google:status'),
  saveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('google:save-credentials', clientId, clientSecret),
  forgetCredentials: () => ipcRenderer.invoke('google:forget-credentials'),
  signIn: () => ipcRenderer.invoke('google:sign-in'),
  signOut: () => ipcRenderer.invoke('google:sign-out'),
  backup: (text) => ipcRenderer.invoke('google:backup', text),
  latest: () => ipcRenderer.invoke('google:latest'),
  restore: () => ipcRenderer.invoke('google:restore'),
})
