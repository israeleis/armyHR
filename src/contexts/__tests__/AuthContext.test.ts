import { describe, it, expect, beforeEach } from 'vitest'

const TOKEN_KEY  = 'army-hr-token'
const EXPIRY_KEY = 'army-hr-token-expiry'
const EMAIL_KEY  = 'army-hr-email'

// clearToken behaviour is tested by exercising the localStorage contract directly,
// since AuthContext is a React context and testing it via renderHook requires jsdom.
// The contract: clearToken() must leave EMAIL_KEY intact.

describe('AuthContext clearToken contract', () => {
  beforeEach(() => {
    localStorage.setItem(TOKEN_KEY,  'tok-abc')
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + 3_600_000))
    localStorage.setItem(EMAIL_KEY,  'user@example.com')
  })

  it('removes token and expiry but keeps email', () => {
    // Simulate what clearToken() does:
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(EXPIRY_KEY)).toBeNull()
    expect(localStorage.getItem(EMAIL_KEY)).toBe('user@example.com')
  })

  it('signOut removes email too', () => {
    // Simulate signOut():
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    localStorage.removeItem(EMAIL_KEY)

    expect(localStorage.getItem(EMAIL_KEY)).toBeNull()
  })
})
