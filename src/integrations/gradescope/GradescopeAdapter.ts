export interface GradescopeAdapter {
  readonly connected: boolean
  importAssignments(input: string): Promise<Array<{ title: string; dueAt: string }>>
}

export class PastedGradescopeAdapter implements GradescopeAdapter {
  readonly connected = false
  async importAssignments(_input: string) { return [] }
}
