import { useState, type ReactNode } from 'react'

export interface TabItem {
  key:      string
  label:    string
  icon?:    ReactNode
  children: ReactNode
}

interface TabsProps {
  items:       TabItem[]
  defaultKey?: string
  activeKey?:  string
  onChange?:   (key: string) => void
}

export default function Tabs({ items, defaultKey, activeKey: controlled, onChange }: TabsProps) {
  const [internal, setInternal] = useState(defaultKey ?? items[0]?.key ?? '')
  const active = controlled ?? internal

  const handleClick = (key: string) => {
    if (!controlled) setInternal(key)
    onChange?.(key)
  }

  const current = items.find(i => i.key === active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="pus-tabs-bar">
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            className={`pus-tab ${active === item.key ? 'active' : ''}`}
            onClick={() => handleClick(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
      <div key={active} style={{ flex: 1, minHeight: 0, animation: 'fade-up 0.2s ease both' }}>
        {current?.children}
      </div>
    </div>
  )
}
