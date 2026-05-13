import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../tests/helpers/msw/server'
import ScheduleEditor from './ScheduleEditor'

describe('ScheduleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and displays schedules on mount', async () => {
    server.use(
      http.get('/api/admin/backup-v2/schedules', () => {
        return HttpResponse.json({
          schedules: [
            {
              id: 'sched-1',
              name: 'Daily backup',
              cron_expression: '0 3 * * *',
              timezone: 'Europe/Amsterdam',
              is_enabled: 1,
              retention_days: 30,
              max_backups: 10,
              last_run_at: '2026-05-10T03:00:00Z',
              last_status: 'success',
              next_run_at: '2026-05-11T03:00:00Z',
            },
          ],
        })
      })
    )

    render(<ScheduleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Daily backup')).toBeTruthy()
    })
  })

  it('handles empty schedules list', async () => {
    server.use(
      http.get('/api/admin/backup-v2/schedules', () => {
        return HttpResponse.json({
          schedules: [],
        })
      })
    )

    render(<ScheduleEditor />)

    await waitFor(() => {
      // Component renders but shows empty state
      const header = screen.getByRole('heading')
      expect(header).toBeTruthy()
    })
  })
})
