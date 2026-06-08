import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractSpreadsheetId,
  listFolderContents,
  searchSheets,
  getSpreadsheetTitle,
} from '../sheetsClient'

// ── extractSpreadsheetId ─────────────────────────────────

describe('extractSpreadsheetId', () => {
  it('extracts ID from standard edit URL', () => {
    expect(
      extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0')
    ).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms')
  })

  it('extracts ID from view URL', () => {
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/ABC123/view')).toBe('ABC123')
  })

  it('handles IDs with dashes and underscores', () => {
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1Bxi-MV_s0/edit')).toBe('1Bxi-MV_s0')
  })

  it('returns null for a Google Doc URL', () => {
    expect(extractSpreadsheetId('https://docs.google.com/document/d/ABC123/edit')).toBeNull()
  })

  it('returns null for plain text', () => {
    expect(extractSpreadsheetId('not a url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractSpreadsheetId('')).toBeNull()
  })
})

// ── listFolderContents ───────────────────────────────────

describe('listFolderContents', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('splits response into folders and sheets', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        files: [
          { id: 'f1', name: 'יחידות', mimeType: 'application/vnd.google-apps.folder' },
          { id: 's1', name: 'מצבת', mimeType: 'application/vnd.google-apps.spreadsheet' },
        ],
      }),
    } as Response)

    const result = await listFolderContents('tok', 'root')
    expect(result.folders).toEqual([{ id: 'f1', name: 'יחידות' }])
    expect(result.sheets).toEqual([{ id: 's1', name: 'מצבת' }])
    expect(result.nextPageToken).toBeUndefined()
  })

  it('includes nextPageToken when present', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [], nextPageToken: 'tok123' }),
    } as Response)

    const result = await listFolderContents('tok', 'root')
    expect(result.nextPageToken).toBe('tok123')
  })

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as Response)

    await expect(listFolderContents('tok', 'root')).rejects.toThrow('Drive API 403')
  })
})

// ── searchSheets ─────────────────────────────────────────

describe('searchSheets', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns matching sheets', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [{ id: 's1', name: 'מצבת 2026' }] }),
    } as Response)

    const result = await searchSheets('tok', 'מצבת')
    expect(result.sheets).toEqual([{ id: 's1', name: 'מצבת 2026' }])
  })

  it('escapes single quotes in query', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
    } as Response)

    await searchSheets('tok', "O'Reilly")
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain("O%5C%27Reilly")
  })
})

// ── getSpreadsheetTitle ──────────────────────────────────

describe('getSpreadsheetTitle', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the spreadsheet title', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ properties: { title: 'My Sheet' } }),
    } as Response)

    const title = await getSpreadsheetTitle('tok', 'spreadsheet-id')
    expect(title).toBe('My Sheet')
  })

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response)

    await expect(getSpreadsheetTitle('tok', 'bad-id')).rejects.toThrow('Sheets API 404')
  })
})
