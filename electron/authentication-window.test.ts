import { describe, expect, it } from 'vitest'
import { isAllowedAuthenticationPopup, persistentSessionWebPreferences } from './authentication-window'

describe('persistent authentication windows', () => {
  it('keeps authentication popups in the integration session partition', () => {
    expect(persistentSessionWebPreferences('persist:gradescope')).toEqual({
      partition: 'persist:gradescope',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
  })

  it('allows secure SSO popups and rejects local or insecure popup URLs', () => {
    expect(isAllowedAuthenticationPopup('https://login.microsoftonline.com/')).toBe(true)
    expect(isAllowedAuthenticationPopup('about:blank')).toBe(true)
    expect(isAllowedAuthenticationPopup('http://example.com/')).toBe(false)
    expect(isAllowedAuthenticationPopup('file:///tmp/login.html')).toBe(false)
  })
})
