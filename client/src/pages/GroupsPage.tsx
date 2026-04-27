import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../i18n'
import { useGroupsStore } from '../store/groupsStore'
import { useAuthStore } from '../store/authStore'
import { tripsApi, groupsApi } from '../api/client'
import { joinGroup, leaveGroup, addListener, removeListener } from '../api/websocket'
import Navbar from '../components/Layout/Navbar'
import Modal from '../components/shared/Modal'
import {
  Users, Plus, X, Search, Trash2, ChevronLeft, Crown, Shield,
  User, MapPin, CalendarDays, ExternalLink, MoreHorizontal,
  Link2, Copy, Check
} from 'lucide-react'
import DateAvailabilityV2 from '../components/Collab/DateAvailabilityV2'
import toast from 'react-hot-toast'

interface TripOption {
  id: number
  title: string
  cover_image?: string | null
  start_date?: string | null
  end_date?: string | null
}

export default function GroupsPage(): React.ReactElement {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    groups, currentGroup, loading, error,
    loadGroups, createGroup, getGroup, updateGroup, deleteGroup,
    addMember, removeMember, updateMemberRole, addTrip, removeTrip,
    searchUsers, setCurrentGroup, clearError
  } = useGroupsStore()

  const [view, setView] = useState<'list' | 'detail'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState<Array<{ id: number; username: string; email: string; avatar: string | null }>>([])
  const [searchingMembers, setSearchingMembers] = useState(false)
  const [showAddTrip, setShowAddTrip] = useState(false)
  const [availableTrips, setAvailableTrips] = useState<TripOption[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [editingGroup, setEditingGroup] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [memberMenuOpen, setMemberMenuOpen] = useState<number | null>(null)
  const memberMenuRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>()

  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState<{ max_uses: number; expires_in_days: number | '' }>({ max_uses: 1, expires_in_days: 7 })

  useEffect(() => { loadGroups() }, [])
  useEffect(() => { clearError() }, [view])

  // Join WebSocket rooms for all groups and listen for live updates
  useEffect(() => {
    groups.forEach(g => joinGroup(g.id))

    const handler = (event: Record<string, unknown>) => {
      const gid = (event as any).groupId as number
      if (!gid) return
      if (event.type === 'group:memberJoined' || event.type === 'group:memberLeft' || event.type === 'group:memberRoleUpdated') {
        // If the current user was removed from the group they're viewing, kick them back to list
        if (event.type === 'group:memberLeft' && currentGroup?.id === gid) {
          const removedUserId = (event as any).userId as number
          if (removedUserId === user?.id) {
            setView('list')
            setCurrentGroup(null)
            loadGroups()
            return
          }
        }
        // Refresh current group detail if open
        if (currentGroup?.id === gid) {
          getGroup(gid)
        }
        // Also refresh the groups list so member counts stay correct
        loadGroups()
      }
    }
    addListener(handler)

    return () => {
      groups.forEach(g => leaveGroup(g.id))
      removeListener(handler)
    }
  }, [groups, currentGroup])

  // Close member menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (memberMenuRef.current && !memberMenuRef.current.contains(e.target as Node)) {
        setMemberMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleCreate = async () => {
    if (!createName.trim()) return
    try {
      await createGroup({ name: createName.trim(), description: createDesc.trim() || undefined })
      toast.success(t('groups.toast.created') || 'Group created')
      setShowCreate(false)
      setCreateName('')
      setCreateDesc('')
      loadGroups()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleOpenGroup = async (groupId: number) => {
    const group = await getGroup(groupId)
    if (group) {
      setView('detail')
      setEditName(group.name)
      setEditDesc(group.description || '')
      setInviteLink(null)
      setInviteError(null)
      // Try to load existing invite link (owner/admin only)
      if (group.role === 'owner' || group.role === 'admin') {
        try {
          const linkData = await groupsApi.getInviteLink(groupId)
          if (linkData?.link?.token) {
            setInviteLink(`${window.location.origin}/join-group/${linkData.link.token}`)
          }
        } catch {
          // No existing link or not allowed — ignore
        }
      }
    }
  }

  const handleBack = () => {
    setView('list')
    setCurrentGroup(null)
    setEditingGroup(false)
    setInviteLink(null)
    setInviteError(null)
  }

  const handleUpdateGroup = async () => {
    if (!currentGroup || !editName.trim()) return
    try {
      await updateGroup(currentGroup.id, { name: editName.trim(), description: editDesc.trim() || null })
      toast.success(t('groups.toast.updated') || 'Group updated')
      setEditingGroup(false)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleDeleteGroup = async () => {
    if (!currentGroup) return
    try {
      await deleteGroup(currentGroup.id)
      toast.success(t('groups.toast.deleted') || 'Group deleted')
      setShowDeleteConfirm(false)
      setView('list')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleSearchMembers = useCallback((q: string) => {
    setMemberSearch(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) {
      setMemberResults([])
      return
    }
    setSearchingMembers(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchUsers(q.trim())
        setMemberResults(results)
      } catch (err: any) {
        toast.error(err.message)
      } finally {
        setSearchingMembers(false)
      }
    }, 300)
  }, [searchUsers])

  const handleAddMember = async (userId: number) => {
    if (!currentGroup) return
    try {
      await addMember(currentGroup.id, userId)
      toast.success(t('groups.toast.memberAdded') || 'Member added')
      setShowAddMember(false)
      setMemberSearch('')
      setMemberResults([])
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleRemoveMember = async (memberUserId: number) => {
    if (!currentGroup) return
    try {
      await removeMember(currentGroup.id, memberUserId)
      toast.success(t('groups.toast.memberRemoved') || 'Member removed')
      setMemberMenuOpen(null)
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleUpdateRole = async (memberUserId: number, role: 'admin' | 'member') => {
    if (!currentGroup) return
    try {
      await updateMemberRole(currentGroup.id, memberUserId, role)
      toast.success(t('groups.toast.roleUpdated') || 'Role updated')
      setMemberMenuOpen(null)
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleOpenAddTrip = async () => {
    setShowAddTrip(true)
    setTripsLoading(true)
    try {
      const data = await tripsApi.list()
      const userTrips: TripOption[] = (data.trips || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        cover_image: t.cover_image,
        start_date: t.start_date,
        end_date: t.end_date,
      }))
      const existingIds = new Set(currentGroup?.trips?.map(gt => gt.trip_id) || [])
      setAvailableTrips(userTrips.filter(t => !existingIds.has(t.id)))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setTripsLoading(false)
    }
  }

  const handleAddTrip = async (tripId: number) => {
    if (!currentGroup) return
    try {
      await addTrip(currentGroup.id, tripId)
      toast.success(t('groups.toast.tripAdded') || 'Trip added')
      setShowAddTrip(false)
      setAvailableTrips([])
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleRemoveTrip = async (tripId: number) => {
    if (!currentGroup) return
    try {
      await removeTrip(currentGroup.id, tripId)
      toast.success(t('groups.toast.tripRemoved') || 'Trip removed')
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleCreateInvite = async () => {
    if (!currentGroup) return
    setInviteLoading(true)
    setInviteError(null)
    try {
      const result = await groupsApi.createInviteLink(currentGroup.id, {
        role: 'member',
        max_uses: inviteForm.max_uses,
        expires_in_days: inviteForm.expires_in_days || undefined,
      })
      const url = `${window.location.origin}/join-group/${result.token}`
      setInviteLink(url)
      setShowInviteModal(false)
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        toast.success(t('groups.invite.copied') || 'Link copied!')
        setTimeout(() => setCopied(false), 2000)
      } catch { /* clipboard not critical */ }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message || 'Failed to create invite link'
      setInviteError(msg)
      toast.error(msg)
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCopyInvite = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success(t('groups.invite.copied') || 'Link copied!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('groups.invite.copyFailed') || 'Copy failed')
    }
  }

  const handleRevokeInvite = async () => {
    if (!currentGroup) return
    try {
      await groupsApi.deleteInviteLink(currentGroup.id)
      setInviteLink(null)
      toast.success(t('groups.invite.revoked') || 'Invite link revoked')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const canManageMembers = currentGroup?.role === 'owner' || currentGroup?.role === 'admin'
  const isOwner = currentGroup?.role === 'owner'

  // Cover image placeholder
  const coverStyle = (url?: string | null) => ({
    backgroundImage: url ? `url(${url})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pb-8" style={{ paddingTop: 'calc(var(--nav-h) + 24px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          {view === 'detail' && currentGroup ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
              >
                <ChevronLeft size={20} />
              </button>
              {editingGroup ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-lg font-semibold border"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                  <button onClick={handleUpdateGroup} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                    {t('common.save') || 'Save'}
                  </button>
                  <button onClick={() => { setEditingGroup(false); setEditName(currentGroup.name); setEditDesc(currentGroup.description || '') }} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    {t('common.cancel') || 'Cancel'}
                  </button>
                </div>
              ) : (
                <div>
                  <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{currentGroup.name}</h1>
                  {currentGroup.description && (
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{currentGroup.description}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('groups.title') || 'Groups'}</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{t('groups.subtitle') || 'Organize and share trips with your travel companions'}</p>
            </div>
          )}

          {view === 'list' ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent)' }}
            >
              <Plus size={16} />
              {t('groups.create') || 'Create Group'}
            </button>
          ) : currentGroup && !editingGroup ? (
            <div className="flex items-center gap-2">
              {canManageMembers && (
                <button
                  onClick={() => setEditingGroup(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                >
                  {t('common.edit') || 'Edit'}
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-danger)', color: 'white' }}
                >
                  <Trash2 size={14} className="inline mr-1" />
                  {t('common.delete') || 'Delete'}
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Invite link banner (detail view, owner/admin only) */}
        {view === 'detail' && currentGroup && canManageMembers && (
          <div className="mb-4 p-3 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            {!inviteLink ? (
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                      {t('groups.invite.title') || 'Invite others with a shareable link'}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent)' }}
                  >
                    <Link2 size={12} />
                    {t('groups.invite.create') || 'Create Link'}
                  </button>
                </div>
                {inviteError && (
                  <p className="mt-2 text-[11px]" style={{ color: 'var(--text-danger)' }}>
                    {inviteError}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-3 py-1.5 rounded-lg border text-xs"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleCopyInvite}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                  title={t('common.copy') || 'Copy'}
                >
                  {copied ? <Check size={14} style={{ color: 'var(--accent)' }} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={handleRevokeInvite}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: 'var(--bg-danger)', color: 'white' }}
                >
                  {t('groups.invite.revoke') || 'Revoke'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--bg-danger-soft)', color: 'var(--text-danger)' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && groups.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
          </div>
        )}

        {/* List view */}
        {view === 'list' && (
          <>
            {groups.length === 0 && !loading ? (
              <div className="text-center py-20">
                <Users size={48} className="mx-auto mb-4" style={{ color: 'var(--text-faint)' }} />
                <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-muted)' }}>{t('groups.empty.title') || 'No groups yet'}</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-faint)' }}>{t('groups.empty.description') || 'Create a group to organize trips with your travel companions.'}</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {t('groups.createFirst') || 'Create your first group'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => handleOpenGroup(group.id)}
                    className="text-left rounded-xl border p-4 transition-all hover:shadow-md"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
                  >
                    <div
                      className="w-full h-24 rounded-lg mb-3 flex items-center justify-center"
                      style={{ background: group.cover_image ? undefined : 'var(--bg-secondary)', ...coverStyle(group.cover_image) }}
                    >
                      {!group.cover_image && <Users size={28} style={{ color: 'var(--text-faint)' }} />}
                    </div>
                    <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{group.name}</h3>
                    {group.description && (
                      <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{group.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                      <span className="flex items-center gap-1"><Users size={12} /> {group.member_count}</span>
                      <span className="flex items-center gap-1"><MapPin size={12} /> {group.trip_count}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Detail view */}
        {view === 'detail' && currentGroup && (
          <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Members */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    <Users size={16} className="inline mr-2" />
                    {t('groups.members') || 'Members'}
                    <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-faint)' }}>({currentGroup.members?.length || 0})</span>
                  </h2>
                  {canManageMembers && (
                    <button
                      onClick={() => setShowAddMember(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Plus size={12} /> {t('groups.addMember') || 'Add'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {currentGroup.members?.map(member => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2.5 rounded-lg"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <div className="flex items-center gap-3">
                        {member.avatar ? (
                          <img src={member.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
                            <User size={14} style={{ color: 'var(--text-faint)' }} />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{member.username}</p>
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                            {member.role === 'owner' && <Crown size={10} />}
                            {member.role === 'admin' && <Shield size={10} />}
                            <span>{t(`groups.role.${member.role}`) || member.role}</span>
                          </div>
                        </div>
                      </div>

                      {isOwner && member.user_id !== user?.id && (
                        <div className="relative" ref={memberMenuOpen === member.user_id ? memberMenuRef : undefined}>
                          <button
                            onClick={() => setMemberMenuOpen(memberMenuOpen === member.user_id ? null : member.user_id)}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {memberMenuOpen === member.user_id && (
                            <div
                              className="absolute right-0 top-full mt-1 rounded-lg border shadow-lg py-1 z-10 min-w-[140px]"
                              style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}
                            >
                              {member.role !== 'admin' && (
                                <button
                                  onClick={() => handleUpdateRole(member.user_id, 'admin')}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {t('groups.makeAdmin') || 'Make Admin'}
                                </button>
                              )}
                              {member.role !== 'member' && (
                                <button
                                  onClick={() => handleUpdateRole(member.user_id, 'member')}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {t('groups.makeMember') || 'Make Member'}
                                </button>
                              )}
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="w-full text-left px-3 py-1.5 text-xs"
                                style={{ color: 'var(--text-danger)' }}
                              >
                                {t('groups.removeMember') || 'Remove'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {!isOwner && canManageMembers && member.role === 'member' && member.user_id !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--text-danger)' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trips */}
            <div className="lg:col-span-1">
              <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    <MapPin size={16} className="inline mr-2" />
                    {t('groups.trips') || 'Trips'}
                    <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--text-faint)' }}>({currentGroup.trips?.length || 0})</span>
                  </h2>
                  {canManageMembers && (
                    <button
                      onClick={handleOpenAddTrip}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      <Plus size={12} /> {t('groups.addTrip') || 'Add'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {currentGroup.trips?.map(gt => (
                    <div
                      key={gt.id}
                      className="flex items-center justify-between p-2.5 rounded-lg group"
                      style={{ background: 'var(--bg-secondary)' }}
                    >
                      <button
                        onClick={() => navigate(`/trips/${gt.trip_id}`)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        {gt.trip_cover_image ? (
                          <img src={gt.trip_cover_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
                            <CalendarDays size={12} style={{ color: 'var(--text-faint)' }} />
                          </div>
                        )}
                        <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{gt.trip_title || `Trip #${gt.trip_id}`}</span>
                        <ExternalLink size={10} className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-faint)' }} />
                      </button>
                      {canManageMembers && (
                        <button
                          onClick={() => handleRemoveTrip(gt.trip_id)}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--text-danger)' }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}

                  {(!currentGroup.trips || currentGroup.trips.length === 0) && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
                      {t('groups.noTrips') || 'No trips in this group yet.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Date availability proposals */}
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <DateAvailabilityV2
              groupId={currentGroup.id}
              canCreate={canManageMembers || currentGroup.role === 'member'}
              isAdmin={canManageMembers}
            />
          </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setCreateName(''); setCreateDesc('') }}
        title={t('groups.createModal.title') || 'Create Group'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setCreateName(''); setCreateDesc('') }}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleCreate}
              disabled={!createName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {t('common.create') || 'Create'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('groups.name') || 'Name'} *
            </label>
            <input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder={t('groups.namePlaceholder') || 'e.g. Summer 2025'}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('groups.description') || 'Description'}
            </label>
            <textarea
              value={createDesc}
              onChange={e => setCreateDesc(e.target.value)}
              placeholder={t('groups.descriptionPlaceholder') || 'Optional description...'}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        isOpen={showAddMember}
        onClose={() => { setShowAddMember(false); setMemberSearch(''); setMemberResults([]) }}
        title={t('groups.addMember') || 'Add Member'}
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
            <input
              value={memberSearch}
              onChange={e => handleSearchMembers(e.target.value)}
              placeholder={t('groups.searchUser') || 'Search by username or email...'}
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>

          {searchingMembers && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
            </div>
          )}

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {memberResults.map(u => (
              <div
                key={u.id}
                className="flex items-center justify-between p-2.5 rounded-lg"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center gap-2">
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
                      <User size={12} style={{ color: 'var(--text-faint)' }} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.username}</p>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{u.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleAddMember(u.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {t('common.add') || 'Add'}
                </button>
              </div>
            ))}

            {!searchingMembers && memberSearch.trim().length >= 2 && memberResults.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
                {t('groups.noUsersFound') || 'No users found.'}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Add Trip Modal */}
      <Modal
        isOpen={showAddTrip}
        onClose={() => { setShowAddTrip(false); setAvailableTrips([]) }}
        title={t('groups.addTrip') || 'Add Trip'}
        size="md"
      >
        <div className="space-y-3">
          {tripsLoading && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
            </div>
          )}

          {!tripsLoading && availableTrips.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
              {t('groups.noTripsAvailable') || 'No trips available to add.'}
            </p>
          )}

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {availableTrips.map(trip => (
              <button
                key={trip.id}
                onClick={() => handleAddTrip(trip.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors hover:opacity-80"
                style={{ background: 'var(--bg-secondary)' }}
              >
                {trip.cover_image ? (
                  <img src={trip.cover_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
                    <CalendarDays size={12} style={{ color: 'var(--text-faint)' }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{trip.title}</p>
                  {(trip.start_date || trip.end_date) && (
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      {trip.start_date || ''}{trip.start_date && trip.end_date ? ' – ' : ''}{trip.end_date || ''}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('groups.deleteConfirm.title') || 'Delete Group'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleDeleteGroup}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--text-danger)' }}
            >
              {t('common.delete') || 'Delete'}
            </button>
          </div>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('groups.deleteConfirm.body') || 'Are you sure? This will permanently delete the group and remove all members and trip links.'}
        </p>
      </Modal>

      {/* Invite link creation modal */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title={t('admin.invite.create')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('admin.invite.maxUses')}</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 0].map(n => (
                <button key={n} type="button" onClick={() => setInviteForm(f => ({ ...f, max_uses: n }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    inviteForm.max_uses === n ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}>
                  {n === 0 ? '∞' : `${n}×`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('admin.invite.expiry')}</label>
            <div className="flex gap-2">
              {[
                { value: 1, label: '1d' },
                { value: 3, label: '3d' },
                { value: 7, label: '7d' },
                { value: 14, label: '14d' },
                { value: '', label: '∞' },
              ].map(opt => (
                <button key={String(opt.value)} type="button" onClick={() => setInviteForm(f => ({ ...f, expires_in_days: opt.value as number | '' }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    inviteForm.expires_in_days === opt.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onClick={() => setShowInviteModal(false)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
            <button onClick={handleCreateInvite} disabled={inviteLoading}
              className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2">
              {inviteLoading && <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />}
              {t('admin.invite.createAndCopy')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
