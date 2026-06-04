import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
type Size    = 'sm' | 'md' | 'lg' | 'xl'

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?:  Variant
  size?:     Size
  loading?:  boolean
  icon?:     ReactNode
  block?:    boolean
  iconOnly?: boolean
  children?: ReactNode
}

export default function Btn({
  variant = 'secondary',
  size    = 'md',
  loading = false,
  icon,
  block   = false,
  iconOnly= false,
  children,
  disabled,
  className = '',
  ...rest
}: BtnProps) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    block   ? 'btn-block' : '',
    iconOnly ? 'btn-icon'  : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading
        ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
        : icon}
      {!iconOnly && children}
    </button>
  )
}
