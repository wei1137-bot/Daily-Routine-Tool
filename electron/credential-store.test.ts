import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CredentialStore, type SecureStorageAdapter } from './credential-store'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function credentialPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-routine-credentials-'))
  temporaryDirectories.push(directory)
  return path.join(directory, 'gradescope-credentials.json')
}

describe('Gradescope credential storage', () => {
  it('stores only the safeStorage ciphertext and decrypts it on demand', () => {
    let plaintext = ''
    const secureStorage: SecureStorageAdapter = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => { plaintext = value; return Buffer.from('operating-system-ciphertext') },
      decryptString: () => plaintext
    }
    const filePath = credentialPath()
    const store = new CredentialStore(filePath, secureStorage)
    store.save({ email: 'student@example.edu', password: 'correct horse battery staple' })

    const onDisk = fs.readFileSync(filePath, 'utf8')
    expect(onDisk).not.toContain('student@example.edu')
    expect(onDisk).not.toContain('correct horse battery staple')
    expect(store.load()).toEqual({ email: 'student@example.edu', password: 'correct horse battery staple' })
  })

  it('refuses to save credentials when safeStorage is unavailable', () => {
    const unavailable: SecureStorageAdapter = {
      isEncryptionAvailable: () => false,
      encryptString: () => { throw new Error('must not encrypt') },
      decryptString: () => { throw new Error('must not decrypt') }
    }
    const filePath = credentialPath()
    expect(() => new CredentialStore(filePath, unavailable).save({ email: 'student@example.edu', password: 'secret' }))
      .toThrow(/安全存储/)
    expect(fs.existsSync(filePath)).toBe(false)
  })
})
