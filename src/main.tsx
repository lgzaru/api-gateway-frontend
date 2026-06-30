import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// crypto.randomUUID is unavailable over plain HTTP — polyfill globally
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  // @ts-ignore
  crypto.randomUUID = (): `${string}-${string}-${string}-${string}-${string}` =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    }) as `${string}-${string}-${string}-${string}-${string}`
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
