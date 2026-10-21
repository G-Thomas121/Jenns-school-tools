import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

// remark-breaks: a single newline renders as a line break, the way it looks in the source —
// so answer choices like "a) …\nb) …" stay on separate lines.
const plugins = [remarkGfm, remarkBreaks]

/** Chat-sized markdown on the dark chat background. */
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="prose prose-code:before:content-none prose-code:after:content-none prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5 prose-pre:bg-slate-900">
      <ReactMarkdown remarkPlugins={plugins}>{children}</ReactMarkdown>
    </div>
  )
}

/** Document-sized markdown on a white "paper" page — also what gets printed and copied. */
export function DocumentMarkdown({ children }: { children: string }) {
  return (
    <div className="doc prose prose-code:before:content-none prose-code:after:content-none prose-slate max-w-none prose-headings:font-serif prose-table:text-sm prose-th:bg-slate-100 prose-th:px-3 prose-td:px-3 prose-td:align-top">
      <ReactMarkdown remarkPlugins={plugins}>{children}</ReactMarkdown>
    </div>
  )
}
