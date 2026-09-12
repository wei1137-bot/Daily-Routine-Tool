const sectionHeadings = new Set([
  'course information', 'instructor(s) contact information', 'instructor contact information',
  'student consultation hours', 'additional information', 'course description',
  'course learning outcomes', 'how to succeed in this course',
  'learning resources, technology & texts', 'learning resources, technology and texts',
  'assignments', 'grading scale', 'grades and grade reports', 'attendance policy',
  'late work policy', 'late policy', 'course schedule', 'course logistics',
  'academic integrity', 'ai policy', 'accessibility', 'students with disabilities',
  'mental health and wellness', 'emergency preparedness', 'nondiscrimination statement'
])

const chromeLines = new Set(['menu', 'print', 'expand_more'])

export interface SyllabusDocumentSection {
  id: string
  title: string
  paragraphs: string[]
}

export function parseSyllabusDocument(content: string, overviewTitle: string): SyllabusDocumentSection[] {
  const lines = content.replace(/\r/g, '').split('\n').map((line) => line.trim())
    .filter((line) => !chromeLines.has(line.toLowerCase()))
  const sections: SyllabusDocumentSection[] = []
  let title = overviewTitle
  let paragraphs: string[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
    if (paragraph) paragraphs.push(paragraph)
    paragraphLines = []
  }
  const flushSection = () => {
    flushParagraph()
    if (paragraphs.length) sections.push({ id:`syllabus-section-${sections.length}`, title, paragraphs })
    paragraphs = []
  }

  for (const line of lines) {
    if (!line) {
      flushParagraph()
      continue
    }
    const normalized = line.replace(/:$/, '').trim().toLowerCase()
    if (sectionHeadings.has(normalized)) {
      flushSection()
      title = line.replace(/:$/, '').trim()
      continue
    }
    paragraphLines.push(line)
  }
  flushSection()
  return sections
}

export function SyllabusDocument({ content, emptyText, overviewTitle, contentsTitle }: { content: string; emptyText: string; overviewTitle: string; contentsTitle: string }) {
  const sections = parseSyllabusDocument(content, overviewTitle)
  if (!sections.length) return <div className="syllabus-document-empty">{emptyText}</div>

  return <div className="syllabus-document-layout">
    <nav className="syllabus-document-outline" aria-label={contentsTitle}>
      <strong>{contentsTitle}</strong>
      {sections.map((section) => <button key={section.id} onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior:'smooth', block:'start' })}>{section.title}</button>)}
    </nav>
    <article className="syllabus-document-main">
      {sections.map((section) => <section id={section.id} key={section.id}>
        <h2>{section.title}</h2>
        <div className="syllabus-document-rule"/>
        {section.paragraphs.map((paragraph, index) => {
          const bullet = /^(?:[-•*]|\d+[.)])\s+/.test(paragraph)
            || (/learning outcomes?/i.test(section.title) && index > 0 && !paragraph.endsWith(':'))
          const label = !bullet ? paragraph.match(/^([^:]{1,38}:)\s*(.+)$/) : null
          if (bullet) return <div className="syllabus-document-bullet" key={index}><span/><p>{paragraph.replace(/^(?:[-•*]|\d+[.)])\s+/, '')}</p></div>
          return <p key={index}>{label ? <><strong>{label[1]}</strong> {label[2]}</> : paragraph}</p>
        })}
      </section>)}
    </article>
  </div>
}
