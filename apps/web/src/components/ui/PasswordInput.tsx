import { forwardRef, useState, type InputHTMLAttributes } from 'react'

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
      <path d="M9.88 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.06 3.94" />
      <path d="M6.06 6.06A17.9 17.9 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 3.06-.5" />
    </svg>
  )
}

/**
 * Campo de palavra-passe com botão para mostrar/ocultar o texto.
 * Mesma interface visual que <Input> (label/error/hint), mas força o
 * `type` consoante a visibilidade. O botão é `type="button"` para nunca
 * submeter o formulário e fica fora da ordem de tabulação (tabIndex=-1).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, id, className = '', ...props }, ref) => {
    const [visible, setVisible] = useState(false)
    const inputId = id || props.name || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            className={`input pr-10 ${error ? 'input-error' : ''} ${className}`}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-1 text-subtle transition-colors hover:text-ink focus:outline-none focus-visible:text-caramel-500"
            aria-label={visible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            aria-pressed={visible}
            tabIndex={-1}
          >
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
