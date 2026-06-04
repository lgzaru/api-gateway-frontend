import { useRef, useState, useEffect } from 'react'

interface Props {
  label?: string
  value: string
  onChange: (v: string) => void
  error?: string
}

function parse(v: string): { oct: [string, string, string, string]; pfx: string } {
  const [ip = '', pfx = ''] = v.split('/')
  const p = ip.split('.')
  return { oct: [p[0] ?? '', p[1] ?? '', p[2] ?? '', p[3] ?? ''], pfx }
}

function clampOctet(s: string) {
  const n = parseInt(s)
  if (isNaN(n)) return s
  return String(Math.min(255, Math.max(0, n)))
}

function clampPrefix(s: string) {
  const n = parseInt(s)
  if (isNaN(n)) return s
  return String(Math.min(32, Math.max(0, n)))
}

export default function IpCidrInput({ label, value, onChange, error }: Props) {
  const [oct, setOct] = useState<[string, string, string, string]>(['', '', '', ''])
  const [pfx, setPfx] = useState('')

  const r0 = useRef<HTMLInputElement>(null)
  const r1 = useRef<HTMLInputElement>(null)
  const r2 = useRef<HTMLInputElement>(null)
  const r3 = useRef<HTMLInputElement>(null)
  const rP = useRef<HTMLInputElement>(null)
  const fieldRefs = [r0, r1, r2, r3, rP]

  // Sync from parent (e.g. reset after submit)
  useEffect(() => {
    const parsed = parse(value)
    setOct(parsed.oct)
    setPfx(parsed.pfx)
  }, [value])

  function emit(newOct: [string, string, string, string], newPfx: string) {
    const ip = newOct.join('.')
    onChange(newPfx ? `${ip}/${newPfx}` : ip)
  }

  function focusField(idx: number) {
    const el = fieldRefs[idx]?.current
    if (!el) return
    el.focus()
    el.select()
  }

  function handleOctet(idx: number, raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 3)
    const newOct = [...oct] as [string, string, string, string]
    newOct[idx] = digits
    setOct(newOct)
    emit(newOct, pfx)
    // Auto-advance when 3 digits filled or value exceeds 2-digit boundary (>25 ensures next digit would overflow)
    if (digits.length === 3 || (digits.length === 2 && parseInt(digits) > 25)) {
      if (idx < 3) focusField(idx + 1)
      else focusField(4)
    }
  }

  function handleOctetKey(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === '.' || e.key === 'ArrowRight') {
      e.preventDefault()
      focusField(idx < 3 ? idx + 1 : 4)
    }
    if (e.key === '/') {
      e.preventDefault()
      focusField(4)
    }
    if (e.key === 'Backspace' && oct[idx] === '' && idx > 0) {
      e.preventDefault()
      focusField(idx - 1)
    }
    if (e.key === 'ArrowLeft' && (e.currentTarget.selectionStart ?? 0) === 0 && idx > 0) {
      e.preventDefault()
      focusField(idx - 1)
    }
  }

  function handleOctetBlur(idx: number) {
    if (!oct[idx]) return
    const clamped = clampOctet(oct[idx])
    if (clamped === oct[idx]) return
    const newOct = [...oct] as [string, string, string, string]
    newOct[idx] = clamped
    setOct(newOct)
    emit(newOct, pfx)
  }

  function handlePrefix(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 2)
    setPfx(digits)
    emit(oct, digits)
  }

  function handlePrefixKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && pfx === '') {
      e.preventDefault()
      focusField(3)
    }
    if (e.key === 'ArrowLeft' && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault()
      focusField(3)
    }
  }

  function handlePrefixBlur() {
    if (!pfx) return
    const clamped = clampPrefix(pfx)
    if (clamped === pfx) return
    setPfx(clamped)
    emit(oct, clamped)
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').trim()
    const parsed = parse(text)
    setOct(parsed.oct)
    setPfx(parsed.pfx)
    emit(parsed.oct, parsed.pfx)
    focusField(4)
  }

  const boxBase: React.CSSProperties = {
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--txt-1)',
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'center',
    padding: 0,
    minWidth: 0,
  }

  const sep: React.CSSProperties = {
    color: 'var(--txt-3)',
    fontSize: 13,
    fontFamily: 'monospace',
    userSelect: 'none',
    flexShrink: 0,
  }

  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-1)',
          height: 38,
          padding: '0 10px',
          cursor: 'text',
          gap: 1,
        }}
        onClick={() => r0.current?.focus()}
        onPaste={handlePaste}
      >
        {([r0, r1, r2, r3] as React.RefObject<HTMLInputElement>[]).map((ref, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <input
              ref={ref}
              value={oct[i]}
              onChange={e => handleOctet(i, e.target.value)}
              onKeyDown={e => handleOctetKey(i, e)}
              onBlur={() => handleOctetBlur(i)}
              placeholder="0"
              maxLength={3}
              style={{ ...boxBase, width: oct[i].length > 1 ? 28 : 20 }}
            />
            {i < 3 && <span style={sep}>.</span>}
          </span>
        ))}

        <span style={{ ...sep, margin: '0 4px 0 2px' }}>/</span>

        <input
          ref={rP}
          value={pfx}
          onChange={e => handlePrefix(e.target.value)}
          onKeyDown={handlePrefixKey}
          onBlur={handlePrefixBlur}
          placeholder="24"
          maxLength={2}
          style={{ ...boxBase, width: pfx.length > 1 ? 22 : 16 }}
        />
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
