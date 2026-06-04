import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Mode = 'dark' | 'light'

export interface ThemePalette {
  sidebarBg: string
  headerBg: string
  contentBg: string
  cardBg: string
  border: string
  divider: string
  text1: string
  text2: string
  text3: string
  navActiveBg: string
  navAccent: string
  navActiveIcon: string
  navActiveText: string
  navDefaultText: string
  navHoverBg: string
  navHoverText: string
  groupLabel: string
  bannerBg: string
  bannerBorder: string
}

const DARK: ThemePalette = {
  sidebarBg:      '#0b1022',
  headerBg:       '#0b1022',
  contentBg:      '#060a14',
  cardBg:         '#0d1530',
  border:         'rgba(255,255,255,0.07)',
  divider:        'rgba(255,255,255,0.06)',
  text1:          'rgba(255,255,255,0.88)',
  text2:          'rgba(255,255,255,0.5)',
  text3:          'rgba(255,255,255,0.28)',
  navActiveBg:    'rgba(50,77,255,0.16)',
  navAccent:      '#6272ff',
  navActiveIcon:  '#818cf8',
  navActiveText:  'rgba(255,255,255,0.92)',
  navDefaultText: 'rgba(255,255,255,0.5)',
  navHoverBg:     'rgba(255,255,255,0.05)',
  navHoverText:   'rgba(255,255,255,0.72)',
  groupLabel:     'rgba(255,255,255,0.2)',
  bannerBg:       'linear-gradient(135deg, #0e1b3a 0%, #162245 55%, #0e1b3a 100%)',
  bannerBorder:   'rgba(50,77,255,0.14)',
}

const LIGHT: ThemePalette = {
  sidebarBg:      '#ffffff',
  headerBg:       '#ffffff',
  contentBg:      '#f3f5fb',
  cardBg:         '#ffffff',
  border:         'rgba(0,0,0,0.08)',
  divider:        'rgba(0,0,0,0.07)',
  text1:          'rgba(0,0,0,0.85)',
  text2:          'rgba(0,0,0,0.55)',
  text3:          'rgba(0,0,0,0.38)',
  navActiveBg:    'rgba(50,77,255,0.08)',
  navAccent:      '#324dff',
  navActiveIcon:  '#324dff',
  navActiveText:  '#324dff',
  navDefaultText: 'rgba(0,0,0,0.6)',
  navHoverBg:     'rgba(0,0,0,0.04)',
  navHoverText:   'rgba(0,0,0,0.8)',
  groupLabel:     'rgba(0,0,0,0.35)',
  bannerBg:       'linear-gradient(135deg, #eef1ff 0%, #e2e8ff 55%, #eef1ff 100%)',
  bannerBorder:   'rgba(50,77,255,0.15)',
}

interface ThemeCtx {
  mode: Mode
  isDark: boolean
  toggle: () => void
  colors: ThemePalette
}

const ThemeContext = createContext<ThemeCtx>({
  mode: 'dark', isDark: true, toggle: () => {}, colors: DARK,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = (localStorage.getItem('pus_theme') as Mode) ?? 'dark'
    document.documentElement.dataset.theme = saved
    return saved
  })

  useEffect(() => {
    document.documentElement.dataset.theme = mode
  }, [mode])

  const toggle = () => setMode(m => {
    const next: Mode = m === 'dark' ? 'light' : 'dark'
    localStorage.setItem('pus_theme', next)
    return next
  })

  return (
    <ThemeContext.Provider value={{ mode, isDark: mode === 'dark', toggle, colors: mode === 'dark' ? DARK : LIGHT }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
