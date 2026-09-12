import fs from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'

export interface GradescopeCredentials {
  email: string
  password: string
}

export interface CredentialStatus {
  enabled: boolean
  encryptionAvailable: boolean
  emailHint: string
}

export class CredentialStore {
  constructor(readonly filePath: string) {}

  status(): CredentialStatus {
    const encryptionAvailable = safeStorage.isEncryptionAvailable()
    if (!encryptionAvailable || !fs.existsSync(this.filePath)) {
      return { enabled: false, encryptionAvailable, emailHint: '' }
    }
    try {
      const credentials = this.load()
      return { enabled: Boolean(credentials), encryptionAvailable, emailHint: credentials ? maskEmail(credentials.email) : '' }
    } catch {
      return { enabled: false, encryptionAvailable, emailHint: '' }
    }
  }

  save(credentials: GradescopeCredentials) {
    const email = credentials.email.trim()
    if (!email || !credentials.password) throw new Error('请输入 Gradescope 邮箱和密码。')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 安全存储当前不可用，无法保存密码。')
    const encrypted = safeStorage.encryptString(JSON.stringify({ email, password: credentials.password }))
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify({ version: 1, encrypted: encrypted.toString('base64') }), 'utf8')
  }

  load(): GradescopeCredentials | null {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(this.filePath)) return null
    const envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as { version?: number; encrypted?: string }
    if (envelope.version !== 1 || !envelope.encrypted) throw new Error('Gradescope 凭据文件格式无效。')
    const decrypted = safeStorage.decryptString(Buffer.from(envelope.encrypted, 'base64'))
    const value = JSON.parse(decrypted) as Partial<GradescopeCredentials>
    if (typeof value.email !== 'string' || typeof value.password !== 'string' || !value.email || !value.password) {
      throw new Error('Gradescope 凭据不完整。')
    }
    return { email: value.email, password: value.password }
  }

  clear() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
  }
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return `${email.slice(0, 2)}***`
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`
}
