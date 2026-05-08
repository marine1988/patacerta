import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
// pdf.js worker via Vite ?url import — Vite copia o ficheiro para os
// assets do build e o `import` resolve para a URL final. Sem isto o
// react-pdf tenta carregar de cdnjs e falha em produção (CSP/CORS) ou
// fica dependente de internet.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Spinner } from './Spinner'

// Configurar o worker uma unica vez por bundle. react-pdf usa esta var
// global para spawnar o web worker que faz o parse do PDF.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface DocumentViewerProps {
  /** URL presigned do ficheiro (PDF ou imagem). */
  url: string
  /** Nome do ficheiro original — usado para detectar tipo (extensão). */
  fileName: string
  /**
   * Largura máxima do viewer em pixels. PDF é renderizado a esta largura;
   * imagens usam max-width. Default: 720 (cabe num modal/coluna média).
   */
  maxWidth?: number
}

/**
 * Renderiza inline um documento de verificação:
 *  - PDF → react-pdf (pdf.js, web worker, lazy)
 *  - Imagens (jpg/jpeg/png/webp/gif) → <img>
 *  - Outros → fallback com link para abrir em nova aba
 *
 * Importado via React.lazy nas paginas que o usam para nao inflar o
 * bundle do admin com pdf.js (~400KB gzipped).
 */
export function DocumentViewer({ url, fileName, maxWidth = 720 }: DocumentViewerProps) {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
  const isPdf = ext === 'pdf'

  if (isImage) {
    return (
      <div className="rounded border border-line bg-surface-alt/40 p-2">
        <img
          src={url}
          alt={fileName}
          className="mx-auto h-auto w-full object-contain"
          style={{ maxWidth }}
        />
      </div>
    )
  }

  if (isPdf) {
    return <PdfViewer url={url} maxWidth={maxWidth} />
  }

  // Tipo nao suportado inline. Mostrar link para abrir/descarregar.
  return (
    <div className="rounded border border-line bg-surface-alt/40 p-4 text-sm">
      <p className="text-muted">
        Pré-visualização não disponível para este tipo de ficheiro ({ext || 'desconhecido'}).
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-caramel-700 underline hover:text-caramel-800"
      >
        Abrir {fileName} em nova janela
      </a>
    </div>
  )
}

interface PdfViewerProps {
  url: string
  maxWidth: number
}

function PdfViewer({ url, maxWidth }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [error, setError] = useState<string | null>(null)

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-medium">Erro ao carregar o PDF</p>
        <p className="mt-1 text-xs">{error}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block underline"
        >
          Tentar abrir em nova janela
        </a>
      </div>
    )
  }

  return (
    <div className="rounded border border-line bg-surface-alt/40 p-2">
      <Document
        file={url}
        onLoadSuccess={(pdf) => {
          setNumPages(pdf.numPages)
          setError(null)
        }}
        onLoadError={(err) => {
          // Mensagens de erro do pdf.js sao normalmente em ingles e
          // tecnicas. Damos uma versao curta + mantemos detalhe em xs.
          setError(err.message || 'Falha desconhecida')
        }}
        loading={
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        }
        // O elemento default do react-pdf nao tem text-align, fica colado
        // a esquerda. Centramos via wrapper em vez de tocar no Document.
      >
        <div className="flex justify-center">
          <Page
            pageNumber={pageNumber}
            width={maxWidth}
            renderAnnotationLayer={false}
            renderTextLayer={false}
            // renderTextLayer/AnnotationLayer false reduz CPU/memoria; nao
            // precisamos selecao de texto nem links no preview admin.
          />
        </div>
      </Document>

      {numPages && numPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            className="rounded border border-line px-2 py-1 text-muted hover:bg-surface disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-muted">
            Página {pageNumber} de {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            className="rounded border border-line px-2 py-1 text-muted hover:bg-surface disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
