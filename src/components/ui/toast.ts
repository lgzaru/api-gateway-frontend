type ToastType = 'success' | 'error' | 'info' | 'warning'

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
}

const COLORS: Record<ToastType, string> = {
  success: 'var(--green)',
  error:   'var(--red)',
  info:    'var(--blue)',
  warning: 'var(--orange)',
}

function getContainer() {
  let el = document.getElementById('pus-toasts')
  if (!el) {
    el = document.createElement('div')
    el.id = 'pus-toasts'
    document.body.appendChild(el)
  }
  return el
}

function show(type: ToastType, message: string, duration = 3000) {
  const container = getContainer()
  const el = document.createElement('div')
  el.className = 'pus-toast'
  el.innerHTML = `
    <span style="color:${COLORS[type]};font-size:15px;font-weight:700;flex-shrink:0">${ICONS[type]}</span>
    <span>${message}</span>
  `
  container.appendChild(el)

  setTimeout(() => {
    el.classList.add('exit')
    setTimeout(() => el.remove(), 250)
  }, duration)
}

export const toast = {
  success: (msg: string, duration?: number) => show('success', msg, duration),
  error:   (msg: string, duration?: number) => show('error',   msg, duration),
  info:    (msg: string, duration?: number) => show('info',    msg, duration),
  warning: (msg: string, duration?: number) => show('warning', msg, duration),
}
