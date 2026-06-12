import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
          return HttpResponse.json({
            stats: { trips: 5, places: 20, files_mb: 150 },
            status: null,
          })
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
          return HttpResponse.json({
            stats: { trips: 2, places: 10, files_mb: 50 },
            status: null,
          })
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
          return HttpResponse.json({
            stats: { trips: 1, places: 5, files_mb: 25 },
            status: 'ready',
            token: 'test-token-abc',
            expires_at: new Date().toISOString(),
            downloads_left: 2,
          })
        })
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
