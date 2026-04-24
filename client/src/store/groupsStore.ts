import { create } from 'zustand'
import { groupsApi } from '../api/client'
import { getApiErrorMessage } from '../types'

export interface GroupMember {
  id: number
  group_id: number
  user_id: number
  role: 'owner' | 'admin' | 'member'
  invited_by: number | null
  joined_at: string
  username?: string
  avatar?: string | null
}

export interface GroupTrip {
  id: number
  group_id: number
  trip_id: number
  added_by: number
  added_at: string
  trip_title?: string
  trip_cover_image?: string | null
}

export interface Group {
  id: number
  name: string
  description: string | null
  cover_image: string | null
  created_by: number
  created_at: string
  updated_at: string
  member_count: number
  trip_count: number
  role: 'owner' | 'admin' | 'member'
  members?: GroupMember[]
  trips?: GroupTrip[]
}

interface GroupsState {
  groups: Group[]
  currentGroup: Group | null
  loading: boolean
  error: string | null

  loadGroups: () => Promise<void>
  createGroup: (data: { name: string; description?: string; cover_image?: string }) => Promise<Group>
  getGroup: (id: number) => Promise<Group | null>
  updateGroup: (id: number, data: { name?: string; description?: string | null; cover_image?: string | null }) => Promise<Group | null>
  deleteGroup: (id: number) => Promise<void>

  addMember: (groupId: number, userId: number, role?: string) => Promise<void>
  removeMember: (groupId: number, userId: number) => Promise<void>
  updateMemberRole: (groupId: number, userId: number, role: string) => Promise<void>

  addTrip: (groupId: number, tripId: number) => Promise<void>
  removeTrip: (groupId: number, tripId: number) => Promise<void>

  searchUsers: (q: string) => Promise<Array<{ id: number; username: string; email: string; avatar: string | null }>>

  setCurrentGroup: (group: Group | null) => void
  clearError: () => void
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  currentGroup: null,
  loading: false,
  error: null,

  loadGroups: async () => {
    set({ loading: true, error: null })
    try {
      const data = await groupsApi.list()
      set({ groups: data.groups || [], loading: false })
    } catch (err: unknown) {
      set({ loading: false, error: getApiErrorMessage(err, 'Failed to load groups') })
    }
  },

  createGroup: async (data) => {
    try {
      const result = await groupsApi.create(data)
      const group = result.group as Group
      set(state => ({ groups: [group, ...state.groups] }))
      return group
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to create group'))
    }
  },

  getGroup: async (id) => {
    set({ loading: true, error: null })
    try {
      const result = await groupsApi.get(id)
      const group = result.group as Group
      set({ currentGroup: group, loading: false })
      return group
    } catch (err: unknown) {
      set({ loading: false, error: getApiErrorMessage(err, 'Failed to load group') })
      return null
    }
  },

  updateGroup: async (id, data) => {
    try {
      const result = await groupsApi.update(id, data)
      const group = result.group as Group
      set(state => ({
        groups: state.groups.map(g => g.id === id ? { ...g, ...group } : g),
        currentGroup: state.currentGroup?.id === id ? group : state.currentGroup,
      }))
      return group
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to update group'))
    }
  },

  deleteGroup: async (id) => {
    try {
      await groupsApi.delete(id)
      set(state => ({
        groups: state.groups.filter(g => g.id !== id),
        currentGroup: state.currentGroup?.id === id ? null : state.currentGroup,
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to delete group'))
    }
  },

  addMember: async (groupId, userId, role) => {
    try {
      const result = await groupsApi.addMember(groupId, userId, role)
      set(state => ({
        currentGroup: state.currentGroup?.id === groupId ? result.group : state.currentGroup,
        groups: state.groups.map(g => g.id === groupId ? { ...g, member_count: (g.member_count || 0) + 1 } : g),
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to add member'))
    }
  },

  removeMember: async (groupId, userId) => {
    try {
      await groupsApi.removeMember(groupId, userId)
      set(state => {
        const updatedGroup = state.currentGroup?.id === groupId
          ? { ...state.currentGroup, members: state.currentGroup.members?.filter(m => m.user_id !== userId) }
          : state.currentGroup
        return {
          currentGroup: updatedGroup as Group | null,
          groups: state.groups.map(g => g.id === groupId ? { ...g, member_count: Math.max(0, (g.member_count || 0) - 1) } : g),
        }
      })
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to remove member'))
    }
  },

  updateMemberRole: async (groupId, userId, role) => {
    try {
      await groupsApi.updateMemberRole(groupId, userId, role)
      set(state => {
        if (!state.currentGroup || state.currentGroup.id !== groupId) return state
        return {
          currentGroup: {
            ...state.currentGroup,
            members: state.currentGroup.members?.map(m =>
              m.user_id === userId ? { ...m, role: role as 'owner' | 'admin' | 'member' } : m
            ),
          },
        }
      })
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to update role'))
    }
  },

  addTrip: async (groupId, tripId) => {
    try {
      const result = await groupsApi.addTrip(groupId, tripId)
      set(state => ({
        currentGroup: state.currentGroup?.id === groupId ? result.group : state.currentGroup,
        groups: state.groups.map(g => g.id === groupId ? { ...g, trip_count: (g.trip_count || 0) + 1 } : g),
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to add trip'))
    }
  },

  removeTrip: async (groupId, tripId) => {
    try {
      await groupsApi.removeTrip(groupId, tripId)
      set(state => {
        const updatedGroup = state.currentGroup?.id === groupId
          ? { ...state.currentGroup, trips: state.currentGroup.trips?.filter(t => t.trip_id !== tripId) }
          : state.currentGroup
        return {
          currentGroup: updatedGroup as Group | null,
          groups: state.groups.map(g => g.id === groupId ? { ...g, trip_count: Math.max(0, (g.trip_count || 0) - 1) } : g),
        }
      })
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to remove trip'))
    }
  },

  searchUsers: async (q) => {
    try {
      const result = await groupsApi.searchUsers(q)
      return result.users || []
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Failed to search users'))
    }
  },

  setCurrentGroup: (group) => set({ currentGroup: group }),
  clearError: () => set({ error: null }),
}))
