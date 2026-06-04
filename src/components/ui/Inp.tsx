import { useState, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InpProps {
  label?:         string
  hint?:          string
  error?:         string
  type?:          string
  placeholder?:   string
  value?:         string | number
  onChangeValue?: (v: string) => void
  onChange?:      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  prefix?:        ReactNode
  disabled?:      boolean
  required?:      boolean
  textarea?:      boolean
  rows?:          number
  maxLength?:     number
  autoFocus?:     boolean
  className?:     string
  style?:         React.CSSProperties
  min?:           number | string
  max?:           number | string
  step?:          number | string
  readOnly?:      boolean
}

export default function Inp({
  label,
  hint,
  error,
  prefix,
  type = 'text',
  onChangeValue,
  onChange,
  textarea = false,
  rows = 3,
  className = '',
  style,
  ...rest
}: InpProps) {
  const [showPwd, setShowPwd] = useState(false)
  const isPwd    = type === 'password'
  const inputType = isPwd ? (showPwd ? 'text' : 'password') : type
  const cls = `pus-input ${error ? 'error' : ''} ${className}`.trim()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChangeValue?.(e.target.value)
    onChange?.(e)
  }

  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 10, color: 'var(--txt-3)',
            display: 'flex', pointerEvents: 'none', zIndex: 1,
          }}>
            {prefix}
          </span>
        )}
        {textarea ? (
          <textarea
            className={`pus-textarea ${error ? 'error' : ''} ${className}`.trim()}
            rows={rows}
            onChange={handleChange}
            style={{ paddingLeft: prefix ? 34 : undefined, ...style }}
            value={rest.value as string | undefined}
            placeholder={rest.placeholder}
            disabled={rest.disabled}
            required={rest.required}
            readOnly={rest.readOnly}
            maxLength={rest.maxLength}
            autoFocus={rest.autoFocus}
          />
        ) : (
          <input
            {...rest}
            type={inputType}
            className={cls}
            onChange={handleChange}
            style={{ paddingLeft: prefix ? 34 : undefined, paddingRight: isPwd ? 36 : undefined, ...style }}
          />
        )}
        {isPwd && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            style={{
              position: 'absolute', right: 10,
              background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--txt-3)',
              display: 'flex', padding: 2,
            }}
          >
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
