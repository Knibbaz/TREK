import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { server } from '../../../tests/helpers/msw/server'
import RestoreFlowV2 from './RestoreFlowV2'

describe('RestoreFlowV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders upload step initially', () => {
    render(<RestoreFlowV2 />)
    expect(screen.getByText(/Drop .trek file/i)).toBeTruthy()
  })

  it('shows max file size hint', () => {
    render(<RestoreFlowV2 />)
    expect(screen.getByText(/Max 500 MB/i)).toBeTruthy()
  })
})
