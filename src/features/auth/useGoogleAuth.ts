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
            prompt?: string
            hint?: string
            callback: (response: {
              access_token?: string
              expires_in?: number
              error?: string
            }) => void
            error_callback?: (error: { type: string }) => void
          }) => { requestAccessToken: () => void }
        }
      }
    }
  }
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'
const DEFAULT_EXPIRES_IN = 3600 // 1 hour fallback

async function fetchEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) return ((await res.json()) as { email?: string }).email
  } catch { /* non-fatal */ }
  return undefined
}

// Wait for the GIS script to become available (async defer in index.html)
function waitForGIS(timeoutMs = 5000): Promise<boolean> {
  return new Promise(resolve => {
    if (window.google?.accounts?.oauth2) { resolve(true); return }
    const start = Date.now()
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval)
        resolve(true)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval)
        resolve(false)
      }
    }, 100)
  })
}

export function useGoogleAuth() {
  const { setToken } = useAuth()

  const triggerSignIn = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) { console.error('VITE_GOOGLE_CLIENT_ID is not set'); return }
    if (!window.google?.accounts?.oauth2) { console.error('GIS not loaded'); return }

    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: async (response) => {
        if (response.access_token) {
          const email = await fetchEmail(response.access_token)
          setToken(response.access_token, response.expires_in ?? DEFAULT_EXPIRES_IN, email)
        } else {
          console.error('GIS token error:', response.error)
        }
      },
    }).requestAccessToken()
  }, [setToken])

  // Silently refreshes the token using the stored Google session (no popup).
  // Returns true on success, false if the user needs to sign in manually.
  const silentRefresh = useCallback(async (hint: string): Promise<boolean> => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return false

    const gisReady = await waitForGIS()
    if (!gisReady) return false

    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 8000) // 8s safety timeout

      window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        prompt: '',   // silent — no UI shown
        hint,         // skip account picker
        callback: async (response) => {
          clearTimeout(timer)
          if (response.access_token) {
            // Don't re-fetch email on silent refresh — we already have it stored
            setToken(response.access_token, response.expires_in ?? DEFAULT_EXPIRES_IN)
            resolve(true)
          } else {
            resolve(false)
          }
        },
        error_callback: () => {
          clearTimeout(timer)
          resolve(false)
        },
      }).requestAccessToken()
    })
  }, [setToken])

  return { triggerSignIn, silentRefresh }
}
