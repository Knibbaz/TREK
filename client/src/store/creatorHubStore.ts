import { create } from 'zustand'
import { LibBlock, LibConfig } from '../types'

export interface CreatorHubState {
  config: LibConfig | null
  blocks: LibBlock[]
  isLoading: boolean
  isSaving: boolean
  error: string | null

  // Actions
  setConfig: (config: LibConfig) => void
  updateConfig: (config: Partial<LibConfig>) => void
  setBlocks: (blocks: LibBlock[]) => void
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void

  addBlock: (block: LibBlock) => void
  updateBlock: (id: string, updates: Partial<LibBlock>) => void
  removeBlock: (id: string) => void
  reorderBlocks: (newBlocks: LibBlock[]) => void

  reset: () => void
}

export const useCreatorHubStore = create<CreatorHubState>((set) => ({
  config: null,
  blocks: [],
  isLoading: false,
  isSaving: false,
  error: null,

  setConfig: (config) => set({ config }),
  updateConfig: (updates) => set((state) => ({
    config: state.config ? { ...state.config, ...updates } : null,
  })),
  setBlocks: (blocks) => set({ blocks }),
  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),
  setError: (error) => set({ error }),

  addBlock: (block) => set((state) => ({ blocks: [...state.blocks, block] })),
  updateBlock: (id, updates) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  removeBlock: (id) => set((state) => ({ blocks: state.blocks.filter((b) => b.id !== id) })),
  reorderBlocks: (newBlocks) => set({ blocks: newBlocks }),

  reset: () =>
    set({
      config: null,
      blocks: [],
      isLoading: false,
      isSaving: false,
      error: null,
    }),
}))
