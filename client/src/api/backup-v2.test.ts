import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/helpers/msw/server'
import { userExportApi, backupScheduleApi } from './client'

describe('Backup V2 API Client', () => {
  describe('userExportApi', () => {
    it('fetches export preview', async () => {
      server.use(
        http.get('/api/user/export/preview', () => {
          return HttpResponse.json({
            stats: { trips: 5, places: 20, files_mb: 100 },
            status: null,
          })
        })
      )

      const result = await userExportApi.preview()
      expect(result.stats.trips).toBe(5)
    })

    it('starts export', async () => {
      server.use(
        http.post('/api/user/export', () => {
          return HttpResponse.json({
            status: 'processing',
          })
        })
      )

      const result = await userExportApi.start()
      expect(result.status).toBe('processing')
    })
  })

  describe('backupScheduleApi', () => {
    it('lists schedules', async () => {
      server.use(
        http.get('/api/admin/backup-v2/schedules', () => {
          return HttpResponse.json({
            schedules: [
              {
                id: 'sched-1',
                name: 'Daily backup',
              },
            ],
          })
        })
      )

      const result = await backupScheduleApi.list()
      expect(result.schedules).toHaveLength(1)
    })

    it('creates schedule', async () => {
      server.use(
        http.post('/api/admin/backup-v2/schedules', () => {
          return HttpResponse.json({
            id: 'sched-new',
          })
        })
      )

      const result = await backupScheduleApi.create({ name: 'Weekly' })
      expect(result.id).toBe('sched-new')
    })
  })
})
