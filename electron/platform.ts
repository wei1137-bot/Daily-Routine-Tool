export function hidesMainWindowOnClose(platform = process.platform) {
  return platform !== 'darwin'
}

export function usesMacApplicationMenu(platform = process.platform) {
  return platform === 'darwin'
}
