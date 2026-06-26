import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AuthProvider, useAuth } from '../AuthContext'

const TOKEN_KEY  = 'army-hr-token'
const EXPIRY_KEY = 'army-hr-token-expiry'
const EMAIL_KEY  = 'army-hr-email'

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

beforeEach(() => {
  localStorage.setItem(TOKEN_KEY,  'tok-abc')
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + 3_600_000))
  localStorage.setItem(EMAIL_KEY,  'user@example.com')
})

describe('clearToken', () => {
  it('removes token and expiry but keeps email', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { result.current.clearToken() })

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull()
    expect(localStorage.getItem(EMAIL_KEY)).toBe('user@example.com')
  })
})

describe('signOut', () => {
  it('removes token, expiry, and email', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => { result.current.signOut() })

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull()
    expect(localStorage.getItem(EMAIL_KEY)).toBeNull()
  })
})
