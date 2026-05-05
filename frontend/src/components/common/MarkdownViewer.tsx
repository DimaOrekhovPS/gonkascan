import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

type Props = {
  content: string
}

export function MarkdownViewer({ content }: Props) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-xl sm:text-2xl font-semibold mt-6 sm:mt-8 mb-4 break-words">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-lg sm:text-xl font-semibold mt-6 sm:mt-7 mb-3 break-words">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base sm:text-lg font-semibold mt-5 sm:mt-6 mb-2 break-words">{children}</h3>
    ),

    // body text: align with GitHub README style
    p: ({ children }) => (
      <p className="text-sm sm:text-base text-slate-100 leading-7 sm:leading-relaxed mb-4 break-words">{children}</p>
    ),

    ul: ({ children }) => (
      <ul className="list-disc pl-5 sm:pl-6 mb-4 space-y-2 text-sm sm:text-base">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-5 sm:pl-6 mb-4 space-y-2 text-sm sm:text-base">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-sm sm:text-base text-slate-100 leading-7 break-words">{children}</li>
    ),

    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-white/[0.10] pl-3 sm:pl-4 italic text-slate-300 my-5 text-sm sm:text-base leading-7 break-words">
        {children}
      </blockquote>
    ),

    code: ({ className, children, ...props }) => {
      const text = String(children ?? '')
      const isBlock = Boolean(className) || text.includes('\n')

      if (!isBlock) {
        return (
          <code
            className="px-1 py-0.5 bg-white/[0.04] rounded text-[0.9em] sm:text-[0.95em] font-mono break-words"
            {...props}
          >
            {children}
          </code>
        )
      }

      return (
        <pre className=" border rounded-md p-3 sm:p-4 overflow-x-auto my-5">
          <code
            className={['text-xs sm:text-sm font-mono', className]
              .filter(Boolean)
              .join(' ')}
            {...props}
          >
            {children}
          </code>
        </pre>
      )
    },

    table: ({ children }) => (
      <div className="overflow-x-auto my-5">
        <table className="min-w-[640px] border-collapse border border-white/[0.10] text-sm sm:text-base">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-white/[0.10] bg-white/[0.04] px-2 sm:px-3 py-2 text-left font-semibold text-sm sm:text-base whitespace-nowrap">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border border-white/[0.10] px-2 sm:px-3 py-2 text-sm sm:text-base break-words">{children}</td>
    ),

    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-300 hover:underline break-all">{children}</a>
    ),
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
  )
}
