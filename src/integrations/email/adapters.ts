export interface EmailAdapter {
  readonly name: string
  readonly connected: boolean
  fetchMessages(): Promise<string[]>
}

export class GmailAdapter implements EmailAdapter {
  readonly name = 'Gmail'; readonly connected = false
  async fetchMessages() { return [] as string[] }
}
export class OutlookAdapter implements EmailAdapter {
  readonly name = 'Outlook'; readonly connected = false
  async fetchMessages() { return [] as string[] }
}
