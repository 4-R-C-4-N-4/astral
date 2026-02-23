import { app, BrowserWindow } from 'electron'
import * as path from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  win.webContents.openDevTools()

  win.loadFile(path.join(__dirname, '../src/index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
