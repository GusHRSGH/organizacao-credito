const { app, BrowserWindow, nativeTheme, safeStorage, shell } = require('electron')
const { registerGoogle } = require('./google.cjs')
const path = require('node:path')

const protocol = 'organizacao-credito'
let mainWindow
let pendingAuthCallback

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

function acceptAuthCallback(value) {
  if (typeof value !== 'string' || !value.startsWith(`${protocol}://auth/callback`)) return
  pendingAuthCallback = value
  if (mainWindow) {
    const callbackUrl = pendingAuthCallback
    pendingAuthCallback = undefined
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('auth:callback', callbackUrl))
    } else {
      mainWindow.webContents.send('auth:callback', callbackUrl)
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
}

if (process.platform === 'win32' && process.argv.length >= 2) {
  acceptAuthCallback(process.argv.find((arg) => arg.startsWith(`${protocol}://`)))
}

app.on('second-instance', (_event, argv) => {
  acceptAuthCallback(argv.find((arg) => arg.startsWith(`${protocol}://`)))
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  acceptAuthCallback(url)
})

app.whenReady().then(() => app.setAsDefaultProtocolClient(protocol))

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: 'Cadence',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a1124' : '#f3f6fd',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : null)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = devServerUrl
      ? url.startsWith(devServerUrl)
      : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  if (!gotLock) return
  const { ipcMain } = require('electron')
  ipcMain.handle('auth:consume-callback', (event) => {
    if (!event.senderFrame.url.startsWith('file://')) return null
    const value = pendingAuthCallback
    pendingAuthCallback = undefined
    return value ?? null
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : null)
  registerGoogle({
    ipcMain, app, shell, safeStorage,
    isTrustedSender: (event) => { const url = event.senderFrame?.url ?? ''; return devUrl ? url.startsWith(devUrl) : url.startsWith('file://') },
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
