import { create } from 'zustand'

const useThemeStore = create((set) => ({
  theme: localStorage.getItem('theme') || 'dark',

  toggleTheme: () => set((state) => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.setAttribute('data-theme', next)
    return { theme: next }
  }),

  initTheme: () => {
    const saved = localStorage.getItem('theme') || 'dark'
    document.documentElement.setAttribute('data-theme', saved)
    return { theme: saved }
  },
}))

export default useThemeStore