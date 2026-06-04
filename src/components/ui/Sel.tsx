interface Option { value: string; label: string }

interface SelProps {
  label?:         string
  error?:         string
  options:        Option[]
  placeholder?:   string
  value?:         string
  onChangeValue?: (v: string) => void
  onChange?:      (e: React.ChangeEvent<HTMLSelectElement>) => void
  disabled?:      boolean
  required?:      boolean
  className?:     string
  style?:         React.CSSProperties
}

export default function Sel({
  label,
  error,
  options,
  placeholder,
  onChangeValue,
  onChange,
  className = '',
  style,
  ...rest
}: SelProps) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <select
        className={`pus-select ${error ? 'error' : ''} ${className}`.trim()}
        style={style}
        onChange={e => {
          onChangeValue?.(e.target.value)
          onChange?.(e)
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
