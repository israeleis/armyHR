import { useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}

// The hook returns a stable `triggerSignIn` function
export function useGoogleAuth() {
  const { setToken } = useAuth()

  const triggerSignIn = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID is not set')
      return
    }
    if (!window.google?.accounts?.oauth2) {
      console.error('Google Identity Services script not loaded yet')
      return
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
      callback: async (response) => {
        if (response.access_token) {
          // Fetch email from Google userinfo endpoint
          let email: string | undefined
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${response.access_token}` },
            })
            if (res.ok) {
              const info = await res.json() as { email?: string }
              email = info.email
            }
          } catch { /* non-fatal — email stays undefined */ }
          setToken(response.access_token, email)
        } else {
          console.error('GIS token error:', response.error)
        }
      },
    })
    client.requestAccessToken()
  }, [setToken])

  return { triggerSignIn }
}
