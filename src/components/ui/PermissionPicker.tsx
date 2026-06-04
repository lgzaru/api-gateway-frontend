import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'

const ALL_PERMISSIONS = [
  'PROXY:READ', 'PROXY:WRITE',
  'BILLING:READ', 'BILLING:WRITE',
  'USER:READ', 'USER:WRITE',
  'REPORT:READ', 'REPORT:WRITE',
  'ADMIN:READ', 'ADMIN:WRITE',
  'CATALOGUE:READ',
  'FLAG:READ',
  'VERSION:READ',
  'CHANGELOG:READ',
  'ICE',
]

interface Props {
  label?: string
  value: string[]
  onChange: (v: string[]) => void
  error?: string
}

export default function PermissionPicker({ label, value, onChange, error }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const available = ALL_PERMISSIONS.filter(p => !value.includes(p))

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function add(p: string) {
    onChange([...value, p])
    setOpen(false)
  }

  function remove(p: string) {
    onChange(value.filter(x => x !== p))
  }

  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <div
        style={{
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-1)',
          minHeight: 40,
          padding: '6px 8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
        }}
      >
        {value.map(p => (
          <span
            key={p}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              fontSize: 11,
              padding: '3px 5px 3px 8px',
              color: 'var(--txt-1)',
              fontFamily: 'monospace',
            }}
          >
            {p}
            <button
              type="button"
              onClick={() => remove(p)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--txt-3)',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                lineHeight: 1,
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}

        {available.length > 0 && (
          <div ref={ref} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              style={{
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
                color: 'var(--txt-3)',
                fontSize: 11,
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              + Add <ChevronDown size={10} />
            </button>

            {open && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 60,
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  boxShadow: '0 4px 16px rgba(0,0,0,.3)',
                  minWidth: 190,
                  overflow: 'hidden',
                }}
              >
                {available.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => add(p)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      color: 'var(--txt-1)',
                      fontSize: 12,
                      fontFamily: 'monospace',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {value.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--txt-3)' }}>Select permissions…</span>
        )}
      </div>

      {value.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--txt-3)', marginTop: 4, fontFamily: 'monospace', lineHeight: 1.4 }}>
          {value.join(', ')}
        </div>
      )}

      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
