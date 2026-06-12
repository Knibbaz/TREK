import React from 'react'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../../tests/helpers/render'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/helpers/msw/server'
import { useAuthStore } from '../../store/authStore'
import { useSettingsStore } from '../../store/settingsStore'
import { resetAllStores } from '../../../tests/helpers/store'
import { buildUser, buildSettings } from '../../../tests/helpers/factories'
import AccountTab from './AccountTab'

describe('AccountTab — Backup Export & Import', () => {
  beforeEach(() => {
    resetAllStores()
    server.use(
      http.get('/api/user/export/status', () => HttpResponse.json({ status: null })),
      http.get('/api/auth/passkey/credentials', () => HttpResponse.json({ credentials: [] })),
    )
    useAuthStore.setState({
      user: buildUser({ id: 1, username: 'testuser' }),
      isAuthenticated: true,
      loadUser: vi.fn().mockResolvedValue(undefined),
    })
    useSettingsStore.setState({
      settings: buildSettings(),
      loadSettings: vi.fn().mockResolvedValue(undefined),
    })
  })

  describe('Export Section', () => {
    it('loads export preview on mount', async () => {
      server.use(
        http.get('/api/user/export/preview', () => {
          return HttpResponse.json({ trips: 5, places: 20, files_mb: 150 })
        })
      )

      render(<AccountTab />)

      await waitFor(() => {
        expect(screen.getByText('5')).toBeTruthy()
        expect(screen.getByText('20')).toBeTruthy()
      })
    })

    it('shows export button when no active export', async () => {
      server.use(
        http.get('/api/user/export/preview', () => {
          return HttpResponse.json({ trips: 2, places: 10, files_mb: 50 })
        })
      )

      render(<AccountTab />)

      await waitFor(() => {
        const btns = screen.getAllByText(/Export|export/).filter(el => 
          el.tagName === 'BUTTON'
        )
        expect(btns.length).toBeGreaterThan(0)
      })
    })

    it('shows download link when export ready', async () => {
      server.use(
        http.get('/api/user/export/preview', () => {
          return HttpResponse.json({ trips: 1, places: 5, files_mb: 25 })
        }),
        http.get('/api/user/export/status', () => {
          return HttpResponse.json({
            status: 'ready',
            canDownload: true,
            token: 'test-token-abc',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          })
        }),
      )

      render(<AccountTab />)

      await waitFor(() => {
        const links = screen.getAllByRole('link')
        const downloadLink = links.find(link => 
          link.getAttribute('href')?.includes('test-token-abc')
        )
        expect(downloadLink).toBeTruthy()
      })
    })
  })

  describe('Import Section', () => {
    it('renders import section', () => {
      render(<AccountTab />)
      const sections = screen.getAllByRole('button')
      expect(sections.length).toBeGreaterThan(0)
    })
  })
})
