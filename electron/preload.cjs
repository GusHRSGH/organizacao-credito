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
