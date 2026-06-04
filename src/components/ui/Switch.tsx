interface SwitchProps {
  checked:   boolean
  onChange:  (v: boolean) => void
  disabled?: boolean
  size?:     'sm' | 'md'
}

export default function Switch({ checked, onChange, disabled, size = 'md' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`pus-switch ${checked ? 'pus-switch-on' : 'pus-switch-off'} ${size === 'sm' ? 'sm' : ''}`}
    >
      <span className="pus-switch-thumb" />
    </button>
  )
}
