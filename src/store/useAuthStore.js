import { create } from 'zustand'
import client from '../api/client'

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  role: localStorage.getItem('role') || null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await client.post('/auth/login', { email, password })
      console.log('Login API response:', response.data) // Debug: See actual response structure

      // Handle both possible response structures:
      // Case 1: { data: { token: "...", user: { ... } } }
      // Case 2: { data: { accessToken: "...", user: { ... } } }
      // Case 3: { data: { data: { token: "...", user: { ... } } } }
      let token = null
      let userData = null

      if (response.data.data && response.data.data.token) {
        // Structure: { data: { data: { token: "...", user: ... } } }
        token = response.data.data.token
        userData = response.data.data.user
      } else if (response.data.token) {
        // Structure: { data: { token: "...", user: ... } }
        token = response.data.token
        userData = response.data.user
      } else if (response.data.accessToken) {
        // Structure: { data: { accessToken: "...", user: ... } }
        token = response.data.accessToken
        userData = response.data.user
      } else if (response.data.data && response.data.data.accessToken) {
        // Structure: { data: { data: { accessToken: "...", user: ... } } }
        token = response.data.data.accessToken
        userData = response.data.data.user
      }

      if (!token || !userData) {
        throw new Error('Invalid response format from login API')
      }

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('role', userData.role)

      set({ token, user: userData, role: userData.role, isLoading: false })
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed'
      set({ isLoading: false, error: message })
      return { success: false, error: message }
    }
  },

  logout: () => {
    // Clean up any incorrect storage keys that might have been used
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('role')
    localStorage.removeItem('auth') // Remove incorrect key if present
    set({ token: null, user: null, role: null, error: null })
  },

  clearError: () => set({ error: null }),
}))

export default useAuthStore