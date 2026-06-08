import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoogleAuth } from './useGoogleAuth'
import { useAuth } from '@/contexts/AuthContext'

export function SignInScreen() {
  const { isSignedIn } = useAuth()
  const { triggerSignIn } = useGoogleAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isSignedIn) navigate('/sheets', { replace: true })
  }, [isSignedIn, navigate])

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-background px-6 text-center gap-8">
      {/* Tactical logo area */}
      <div>
        <div className="text-headline-lg font-bold text-primary mb-2">מצבת</div>
        <div className="text-body-md text-on-surface-variant">ניהול כוח אדם טקטי</div>
      </div>

      {/* Description */}
      <div className="max-w-xs text-sm text-on-surface-variant leading-relaxed">
        כניסה עם חשבון Google שיש לו גישה לגיליון המצבת.
      </div>

      {/* Sign in button */}
      <button
        onClick={triggerSignIn}
        className="w-full max-w-xs flex items-center justify-center gap-3 bg-primary-container text-on-primary-container
          font-bold py-3 px-6 rounded-md hover:opacity-90 active:opacity-75 transition-opacity"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        כניסה עם Google
      </button>

      {/* No-OAuth-key warning */}
      {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
        <div className="text-xs text-error font-mono bg-error-container/20 rounded px-3 py-2 max-w-xs">
          VITE_GOOGLE_CLIENT_ID לא מוגדר — העתק .env.example לקובץ .env.local
        </div>
      )}
    </div>
  )
}
