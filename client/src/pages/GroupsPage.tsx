import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from '../i18n'
import { useGroupsStore } from '../store/groupsStore'
import { useAuthStore } from '../store/authStore'
import { tripsApi, groupsApi } from '../api/client'
import { joinGroup, leaveGroup, addListener, removeListener } from '../api/websocket'
import Navbar from '../components/Layout/Navbar'
import Modal from '../components/shared/Modal'
import {
  Users, Plus, X, Trash2, ChevronLeft, Crown, Shield,
  User, MapPin, CalendarDays, ExternalLink, MoreHorizontal,
  Link2, Copy, Check, BarChart2, Globe, Clock, Share2, UserCheck,
  Activity, Palette
} from 'lucide-react'
import DateAvailabilityV2 from '../components/Collab/DateAvailabilityV2'
import GroupPolls from '../components/Groups/GroupPolls'
import GroupMap from '../components/Groups/GroupMap'
import type { GroupMapCountry } from '../components/Groups/GroupMap'
import TripFormModal from '../components/Trips/TripFormModal'
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
  const { id: urlGroupId } = useParams<{ id?: string }>()
  const { user } = useAuthStore()
  const {
    groups, currentGroup, loading, error,
    loadGroups, createGroup, getGroup, updateGroup, deleteGroup,
    addMember, removeMember, updateMemberRole, addTrip, removeTrip,
    setCurrentGroup, clearError
  } = useGroupsStore()

  const [view, setView] = useState<'list' | 'detail'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [showAddTrip, setShowAddTrip] = useState(false)
  const [availableTrips, setAvailableTrips] = useState<TripOption[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<TripOption | null>(null)
  const [shareCloneLoading, setShareCloneLoading] = useState(false)
  const [showCreateTripForGroup, setShowCreateTripForGroup] = useState(false)
  const [editingGroup, setEditingGroup] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editWelcomeTitle, setEditWelcomeTitle] = useState('')
  const [editWelcomeBody, setEditWelcomeBody] = useState('')
  const [editWelcomeIcon, setEditWelcomeIcon] = useState('')
  const [savingWelcome, setSavingWelcome] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [memberMenuOpen, setMemberMenuOpen] = useState<number | null>(null)
  const memberMenuRef = useRef<HTMLDivElement>(null)

  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState<{ role: 'member' | 'viewer'; max_uses: number; expires_in_days: number | '' }>({ role: 'member', max_uses: 1, expires_in_days: 7 })
  const [showAdminReassignModal, setShowAdminReassignModal] = useState(false)
  const [selectedNewAdmin, setSelectedNewAdmin] = useState<number | null>(null)

  type Participant = { id: number; username: string; avatar?: string | null }
  const [participantsMap, setParticipantsMap] = useState<Record<number, Participant[]>>({})
  const [editParticipantsTripId, setEditParticipantsTripId] = useState<number | null>(null)
  const [editParticipantsSelected, setEditParticipantsSelected] = useState<Set<number>>(new Set())
  const [editParticipantsSaving, setEditParticipantsSaving] = useState(false)

  type GroupStats = { trip_count: number; country_count: number; total_days: number; milestones: string[] }
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null)
  const [rsvpLoading, setRsvpLoading] = useState<Record<number, boolean>>({})
  const [atlasCountries, setAtlasCountries] = useState<GroupMapCountry[]>([])

  type ActivityEvent = { id: number; actor_id: number | null; actor_name: string | null; event_type: string; resource_id: number | null; resource_title: string | null; created_at: string }
  const [activityFeed, setActivityFeed] = useState<ActivityEvent[]>([])
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)

  const [editBrandColor, setEditBrandColor] = useState('')
  const [savingBrandColor, setSavingBrandColor] = useState(false)

  type Idea = { id: number; user_id: number; username: string | null; title: string; body: string | null; created_at: string }
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [newIdeaTitle, setNewIdeaTitle] = useState('')
  const [newIdeaBody, setNewIdeaBody] = useState('')
  const [savingIdea, setSavingIdea] = useState(false)

  type GroupTask = { id: number; title: string; done: number; assigned_to: number | null; assigned_username: string | null; assigned_avatar: string | null; created_by: number; sort_order: number; created_at: string }
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState<number | ''>('')
  const [savingTask, setSavingTask] = useState(false)

  useEffect(() => { loadGroups() }, [])
  useEffect(() => { clearError() }, [view])

  // Load participants whenever the current group's trips change
  useEffect(() => {
    if (currentGroup?.id && currentGroup.trips && currentGroup.trips.length > 0) {
      loadParticipants(currentGroup.id, currentGroup.trips)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup?.trips])

  // Load stats + atlas + activity when entering group detail
  useEffect(() => {
    if (currentGroup?.id) {
      groupsApi.getStats(currentGroup.id).then(setGroupStats).catch(() => setGroupStats(null))
      groupsApi.getAtlas(currentGroup.id).then(r => setAtlasCountries(r.countries)).catch(() => setAtlasCountries([]))
      setActivityFeed([])
      setActivityLoading(true)
      groupsApi.getActivity(currentGroup.id).then(r => {
        setActivityFeed(r.events)
        setActivityHasMore(r.hasMore)
      }).catch(() => {}).finally(() => setActivityLoading(false))
      setEditBrandColor(currentGroup.brand_color || '')
      groupsApi.listIdeas(currentGroup.id).then(r => setIdeas(r.ideas)).catch(() => setIdeas([]))
      groupsApi.listTasks(currentGroup.id).then(r => setTasks(r.tasks)).catch(() => setTasks([]))
    } else {
      setGroupStats(null)
      setAtlasCountries([])
      setActivityFeed([])
      setIdeas([])
      setTasks([])
    }
  }, [currentGroup?.id])

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
            loadGroups()
            navigate('/groups')
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
      const group = await createGroup({ name: createName.trim(), description: createDesc.trim() || undefined })
      toast.success(t('groups.toast.created') || 'Group created')
      setShowCreate(false)
      setCreateName('')
      setCreateDesc('')
      navigate(`/groups/${group.id}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleOpenGroup = async (groupId: number) => {
    const group = await getGroup(groupId)
    if (group) {
      navigate(`/groups/${groupId}`)
      setView('detail')
      setEditName(group.name)
      setEditDesc(group.description || '')
      setEditWelcomeTitle(group.welcome_title || '')
      setEditWelcomeBody(group.welcome_body || '')
      setEditWelcomeIcon(group.welcome_icon || '')
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

  // Sync view with URL param
  useEffect(() => {
    if (urlGroupId) {
      const gid = parseInt(urlGroupId, 10)
      if (!currentGroup || currentGroup.id !== gid) {
        handleOpenGroup(gid)
      }
    } else {
      setView('list')
      setCurrentGroup(null)
      setEditingGroup(false)
      setInviteLink(null)
      setInviteError(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlGroupId])

  const handleBack = () => {
    navigate('/groups')
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

  const handleCoverUpload = async (file: File) => {
    if (!currentGroup) return
    setUploadingCover(true)
    try {
      await groupsApi.uploadCover(currentGroup.id, file)
      await getGroup(currentGroup.id)
      toast.success(t('groups.toast.coverUpdated') || 'Cover updated')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setUploadingCover(false)
    }
  }

  const handleCoverDelete = async () => {
    if (!currentGroup) return
    try {
      await groupsApi.deleteCover(currentGroup.id)
      await getGroup(currentGroup.id)
      toast.success(t('groups.toast.coverRemoved') || 'Cover removed')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleSaveWelcome = async () => {
    if (!currentGroup) return
    setSavingWelcome(true)
    try {
      await groupsApi.updateWelcome(currentGroup.id, {
        welcome_title: editWelcomeTitle.trim() || null,
        welcome_body: editWelcomeBody.trim() || null,
        welcome_icon: editWelcomeIcon.trim() || null,
      })
      toast.success(t('groups.toast.welcomeSaved') || 'Welcome message saved')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingWelcome(false)
    }
  }

  const handleRsvp = async (tripId: number) => {
    if (!currentGroup || !user) return
    setRsvpLoading(prev => ({ ...prev, [tripId]: true }))
    try {
      const result = await groupsApi.rsvpTrip(currentGroup.id, tripId)
      setParticipantsMap(prev => ({ ...prev, [tripId]: result.participants }))
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setRsvpLoading(prev => ({ ...prev, [tripId]: false }))
    }
  }

  const handleLoadMoreActivity = async () => {
    if (!currentGroup || activityLoading) return
    const oldest = activityFeed[activityFeed.length - 1]
    setActivityLoading(true)
    try {
      const r = await groupsApi.getActivity(currentGroup.id, { before: oldest?.id })
      setActivityFeed(prev => [...prev, ...r.events])
      setActivityHasMore(r.hasMore)
    } catch { /* ignore */ } finally {
      setActivityLoading(false)
    }
  }

  const handleSaveBrandColor = async () => {
    if (!currentGroup) return
    setSavingBrandColor(true)
    try {
      await groupsApi.setBrandColor(currentGroup.id, editBrandColor || null)
      await getGroup(currentGroup.id)
      toast.success('Kleur opgeslagen')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSavingBrandColor(false)
    }
  }

  const handleAddIdea = async () => {
    if (!currentGroup || !newIdeaTitle.trim()) return
    setSavingIdea(true)
    try {
      const r = await groupsApi.createIdea(currentGroup.id, { title: newIdeaTitle.trim(), body: newIdeaBody.trim() || undefined })
      setIdeas(prev => [r.idea, ...prev])
      setNewIdeaTitle('')
      setNewIdeaBody('')
    } catch (err: any) { toast.error(err.message) } finally { setSavingIdea(false) }
  }

  const handleDeleteIdea = async (ideaId: number) => {
    if (!currentGroup) return
    try {
      await groupsApi.deleteIdea(currentGroup.id, ideaId)
      setIdeas(prev => prev.filter(i => i.id !== ideaId))
    } catch (err: any) { toast.error(err.message) }
  }

  const handleAddTask = async () => {
    if (!currentGroup || !newTaskTitle.trim()) return
    setSavingTask(true)
    try {
      const r = await groupsApi.createTask(currentGroup.id, { title: newTaskTitle.trim(), assigned_to: newTaskAssignee || undefined })
      setTasks(prev => [...prev, r.task])
      setNewTaskTitle('')
      setNewTaskAssignee('')
    } catch (err: any) { toast.error(err.message) } finally { setSavingTask(false) }
  }

  const handleToggleTask = async (taskId: number, current: number) => {
    if (!currentGroup) return
    try {
      await groupsApi.updateTask(currentGroup.id, taskId, { done: current ? 0 : 1 })
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: current ? 0 : 1 } : t))
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDeleteTask = async (taskId: number) => {
    if (!currentGroup) return
    try {
      await groupsApi.deleteTask(currentGroup.id, taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (err: any) { toast.error(err.message) }
  }

  const handleWhatsAppShare = () => {
    if (!currentGroup) return
    const trips = currentGroup.trips || []
    const members = currentGroup.members || []
    const lines = [
      `*${currentGroup.name}*`,
      currentGroup.description ? currentGroup.description : '',
      '',
      `👥 ${members.length} leden`,
      `🗺️ ${trips.length} reizen`,
      '',
      ...trips.map(gt => {
        const pts = participantsMap[gt.trip_id] || []
        const dateStr = gt.trip_start_date ? `(${gt.trip_start_date}${gt.trip_end_date ? ' – ' + gt.trip_end_date : ''})` : ''
        const goingStr = pts.length > 0 ? ` · ${pts.length} gaan mee` : ''
        return `• ${gt.trip_title || `Reis #${gt.trip_id}`} ${dateStr}${goingStr}`
      }),
      '',
      `🔗 ${window.location.href}`,
    ].filter(l => l !== undefined).join('\n').trim()
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

  const handleDeleteGroup = async () => {
    if (!currentGroup) return
    try {
      await deleteGroup(currentGroup.id)
      toast.success(t('groups.toast.deleted') || 'Group deleted')
      setShowDeleteConfirm(false)
      navigate('/groups')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleLeaveGroup = async () => {
    if (!currentGroup || !user) return

    // If admin, show reassignment modal
    if (currentGroup.role === 'admin') {
      setShowAdminReassignModal(true)
      setShowLeaveConfirm(false)
      return
    }

    try {
      await removeMember(currentGroup.id, user.id)
      toast.success(t('groups.toast.left') || 'Left group')
      setShowLeaveConfirm(false)
      navigate('/groups')
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleLeaveAsAdmin = async () => {
    if (!currentGroup || !user) return
    if (!selectedNewAdmin) {
      toast.error(t('groups.admin.selectReplacement') || 'Please select a member to promote to admin')
      return
    }
    try {
      await groupsApi.leaveGroup(currentGroup.id, selectedNewAdmin)
      toast.success(t('groups.toast.left') || 'Left group')
      setShowAdminReassignModal(false)
      setShowLeaveConfirm(false)
      setSelectedNewAdmin(null)
      navigate('/groups')
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
      setSelectedTrip(null)
      setAvailableTrips([])
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const handleShareOriginal = async () => {
    if (!selectedTrip) return
    await handleAddTrip(selectedTrip.id)
  }

  const handleCreateTripForGroup = async (data: Record<string, string | number | null>) => {
    if (!currentGroup) return
    const result = await tripsApi.create(data)
    await addTrip(currentGroup.id, result.trip.id)
    setShowCreateTripForGroup(false)
    setShowAddTrip(false)
    setSelectedTrip(null)
    setAvailableTrips([])
    toast.success(t('groups.toast.tripAdded') || 'Trip added')
    getGroup(currentGroup.id)
    return result
  }

  const handleCloneTrip = async () => {
    if (!currentGroup || !selectedTrip) return
    setShareCloneLoading(true)
    try {
      const copy = await tripsApi.copy(selectedTrip.id)
      await addTrip(currentGroup.id, copy.trip.id)
      toast.success(t('groups.toast.tripAdded') || 'Trip added')
      setShowAddTrip(false)
      setSelectedTrip(null)
      setAvailableTrips([])
      getGroup(currentGroup.id)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setShareCloneLoading(false)
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

  const loadParticipants = async (groupId: number, trips: { trip_id: number }[]) => {
    const results = await Promise.all(
      trips.map(gt => groupsApi.getTripParticipants(groupId, gt.trip_id).catch(() => ({ participants: [] })))
    )
    const map: Record<number, Participant[]> = {}
    trips.forEach((gt, i) => { map[gt.trip_id] = results[i].participants || [] })
    setParticipantsMap(map)
  }

  const handleOpenEditParticipants = (tripId: number) => {
    const current = participantsMap[tripId] || []
    setEditParticipantsSelected(new Set(current.map(p => p.id)))
    setEditParticipantsTripId(tripId)
  }

  const handleSaveParticipants = async () => {
    if (!currentGroup || editParticipantsTripId === null) return
    setEditParticipantsSaving(true)
    try {
      const result = await groupsApi.setTripParticipants(currentGroup.id, editParticipantsTripId, [...editParticipantsSelected])
      setParticipantsMap(prev => ({ ...prev, [editParticipantsTripId]: result.participants || [] }))
      setEditParticipantsTripId(null)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setEditParticipantsSaving(false)
    }
  }

  const handleCreateInvite = async () => {
    if (!currentGroup) return
    setInviteLoading(true)
    setInviteError(null)
    try {
      const result = await groupsApi.createInviteLink(currentGroup.id, {
        role: inviteForm.role,
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
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-base font-semibold border"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    autoFocus
                    placeholder={t('groups.namePlaceholder') || 'Group name'}
                  />
                  <textarea
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    rows={2}
                    className="px-3 py-1.5 rounded-lg text-sm border resize-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                    placeholder={t('groups.descriptionPlaceholder') || 'Optional description...'}
                  />
                  <div className="flex gap-2">
                    <button onClick={handleUpdateGroup} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--accent)' }}>
                      {t('common.save') || 'Save'}
                    </button>
                    <button onClick={() => { setEditingGroup(false); setEditName(currentGroup.name); setEditDesc(currentGroup.description || '') }} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                      {t('common.cancel') || 'Cancel'}
                    </button>
                  </div>
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
              <button
                onClick={handleWhatsAppShare}
                className="p-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-secondary)', color: '#25D366' }}
                title="Delen via WhatsApp"
              >
                <Share2 size={16} />
              </button>
              {canManageMembers && (
                <button
                  onClick={() => setEditingGroup(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                >
                  {t('common.edit') || 'Edit'}
                </button>
              )}
              {!isOwner && (
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: 'var(--bg-danger)', color: 'white' }}
                >
                  {t('groups.leave') || 'Leave'}
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ background: '#ef4444', color: 'white' }}
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={14} />
                    {t('admin.invite.create')}
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

        {/* Cover image upload (owner/admin only) */}
        {view === 'detail' && currentGroup && canManageMembers && (
          <div className="mb-4 p-3 rounded-xl border flex items-center gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div
              className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ background: currentGroup.cover_image ? undefined : 'var(--bg-secondary)', backgroundImage: currentGroup.cover_image ? `url(${currentGroup.cover_image})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}
            >
              {!currentGroup.cover_image && <Users size={22} style={{ color: 'var(--text-faint)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{t('groups.cover.title') || 'Groepsfoto'}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{t('groups.cover.hint') || 'JPG, PNG of WebP · max 8 MB'}</p>
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0]
              if (file) await handleCoverUpload(file)
              e.target.value = ''
            }} />
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
              >
                {uploadingCover
                  ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                  : null}
                {t('groups.cover.upload') || 'Uploaden'}
              </button>
              {currentGroup.cover_image && (
                <button
                  onClick={handleCoverDelete}
                  className="px-2.5 py-1.5 rounded-lg text-xs border transition-colors text-red-500 hover:bg-red-50"
                  style={{ borderColor: 'var(--border-primary)' }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Per-group vacay sharing toggle */}
        {view === 'detail' && currentGroup && (() => {
          const myMember = currentGroup.members?.find(m => m.user_id === user?.id)
          if (!myMember) return null
          const shareVacay = myMember.share_vacay
          // null = use global default (true), true/false = explicit override
          const isSharing = shareVacay === null ? true : !!shareVacay
          return (
            <div className="mb-4 p-3 rounded-xl border flex items-center justify-between" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Deel mijn verlof & reizen</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {isSharing ? 'Jouw verlof en geplande reizen zijn zichtbaar in beschikbaarheidsvoorstellen' : 'Jouw verlof en reizen zijn verborgen voor deze groep'}
                  {shareVacay === null && ' (volgt je standaardinstelling)'}
                </p>
              </div>
              <div className="flex gap-1.5 ml-3 flex-shrink-0">
                <button
                  onClick={async () => {
                    const next = isSharing ? false : null // toggle off = explicit false; toggle on = reset to null (global default)
                    await groupsApi.setMyVacaySharing(currentGroup.id, next)
                    await getGroup(currentGroup.id)
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{ background: isSharing ? 'var(--accent)' : 'var(--bg-secondary)', color: isSharing ? 'white' : 'var(--text-muted)' }}
                >
                  {isSharing ? 'Aan' : 'Uit'}
                </button>
              </div>
            </div>
          )
        })()}

        {/* Brand color (owner/admin only) */}
        {view === 'detail' && currentGroup && canManageMembers && (
          <div className="mb-4 p-3 rounded-xl border flex items-center gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <Palette size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Groepskleur</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>Accentkleur voor deze groep — laat leeg voor standaard</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="color"
                value={editBrandColor || '#111827'}
                onChange={e => setEditBrandColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="Kies kleur"
              />
              <input
                type="text"
                value={editBrandColor}
                onChange={e => setEditBrandColor(e.target.value)}
                placeholder="#111827"
                className="w-24 px-2 py-1 rounded-lg border text-xs font-mono"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
              {editBrandColor && (
                <button onClick={() => setEditBrandColor('')} className="text-xs px-1.5 py-1 rounded" style={{ color: 'var(--text-faint)' }}>✕</button>
              )}
              <button
                onClick={handleSaveBrandColor}
                disabled={savingBrandColor}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {savingBrandColor ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" /> : 'Opslaan'}
              </button>
            </div>
          </div>
        )}

        {/* Welcome message editor (owner/admin only) */}
        {view === 'detail' && currentGroup && canManageMembers && (
          <div className="mb-4 rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {t('groups.welcomeMessage.title') || 'Welcome message'}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {t('groups.welcomeMessage.hint') || 'Shown as a modal when someone joins this group via invite link. Leave empty to use the default message.'}
              </p>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('groups.welcomeMessage.titleLabel') || 'Title'}
                </label>
                <input
                  type="text"
                  value={editWelcomeTitle}
                  onChange={e => setEditWelcomeTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  placeholder={t('groups.welcomeMessage.titlePlaceholder') || 'Welcome to the group!'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('groups.welcomeMessage.bodyLabel') || 'Body (markdown supported)'}
                </label>
                <textarea
                  rows={3}
                  value={editWelcomeBody}
                  onChange={e => setEditWelcomeBody(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border resize-y"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  placeholder={t('groups.welcomeMessage.bodyPlaceholder') || "You're now a member. Start exploring shared trips and availability."}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('groups.welcomeMessage.iconLabel') || 'Icon (Lucide icon name)'}
                </label>
                <input
                  type="text"
                  value={editWelcomeIcon}
                  onChange={e => setEditWelcomeIcon(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                  placeholder="Users"
                />
              </div>
              <button
                onClick={handleSaveWelcome}
                disabled={savingWelcome}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {savingWelcome ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                ) : null}
                {t('common.save') || 'Save'}
              </button>
            </div>
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
          <div
            className="flex flex-col gap-6"
            style={currentGroup.brand_color ? { '--accent': currentGroup.brand_color } as React.CSSProperties : undefined}
          >

          {/* Stats bar + milestones */}
          {groupStats && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: MapPin, label: 'Reizen', value: groupStats.trip_count },
                  { icon: Globe, label: 'Landen', value: groupStats.country_count },
                  { icon: Clock, label: 'Dagen', value: groupStats.total_days },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl border p-3 flex flex-col items-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
                    <Icon size={16} className="mb-1" style={{ color: 'var(--accent)' }} />
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{label}</span>
                  </div>
                ))}
              </div>
              {groupStats.milestones.length > 0 && (() => {
                const MILESTONE_LABELS: Record<string, string> = {
                  first_trip: '🗺️ Eerste reis',
                  trips_5: '✈️ 5 reizen',
                  trips_10: '🏆 10 reizen',
                  trips_25: '🌟 25 reizen',
                  countries_3: '🌍 3 landen',
                  countries_10: '🌐 10 landen',
                  countries_25: '🗺️ 25 landen',
                  anniversary_1y: '🎂 1 jaar samen',
                  anniversary_2y: '🎂 2 jaar samen',
                  anniversary_5y: '🏅 5 jaar samen',
                }
                return (
                  <div className="flex flex-wrap gap-2">
                    {groupStats.milestones.map(m => (
                      <span key={m} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}>
                        {MILESTONE_LABELS[m] || m}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

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

                <div className="space-y-3">
                  {currentGroup.trips?.map(gt => {
                    const tripParticipants = participantsMap[gt.trip_id] || []
                    return (
                      <div
                        key={gt.id}
                        className="rounded-lg p-2.5 group"
                        style={{ background: 'var(--bg-secondary)' }}
                      >
                        <div className="flex items-center justify-between">
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
                        {/* Participants row */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {tripParticipants.length > 0 ? (
                            <div className="flex items-center -space-x-1">
                              {tripParticipants.slice(0, 6).map(p => (
                                p.avatar
                                  ? <img key={p.id} src={p.avatar} title={p.username} className="w-5 h-5 rounded-full ring-1 object-cover" style={{ ringColor: 'var(--bg-secondary)' }} />
                                  : <div key={p.id} title={p.username} className="w-5 h-5 rounded-full ring-1 flex items-center justify-center text-[9px] font-bold" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', outline: '1px solid var(--bg-secondary)' }}>{p.username[0]?.toUpperCase()}</div>
                              ))}
                              {tripParticipants.length > 6 && (
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', outline: '1px solid var(--bg-secondary)' }}>+{tripParticipants.length - 6}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Geen deelnemers</span>
                          )}
                          {canManageMembers && (
                            <button
                              onClick={() => handleOpenEditParticipants(gt.trip_id)}
                              className="text-[11px] underline ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              Bewerken
                            </button>
                          )}
                        </div>
                        {/* RSVP toggle */}
                        {(() => {
                          const going = tripParticipants.some(p => p.id === user?.id)
                          return (
                            <button
                              onClick={() => handleRsvp(gt.trip_id)}
                              disabled={!!rsvpLoading[gt.trip_id]}
                              className="flex items-center gap-1 mt-2 px-2 py-1 rounded-md text-[11px] font-medium transition-colors"
                              style={{
                                background: going ? 'var(--accent)' : 'var(--bg-card)',
                                color: going ? 'white' : 'var(--text-muted)',
                                border: `1px solid ${going ? 'transparent' : 'var(--border-primary)'}`,
                              }}
                            >
                              {rsvpLoading[gt.trip_id]
                                ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                                : <UserCheck size={10} />
                              }
                              {going ? 'Ik ga mee' : 'Ga je mee?'}
                            </button>
                          )
                        })()}
                      </div>
                    )
                  })}

                  {(!currentGroup.trips || currentGroup.trips.length === 0) && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
                      {t('groups.noTrips') || 'No trips in this group yet.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Reisarchief tijdlijn */}
          {(currentGroup.trips || []).length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <BarChart2 size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Reisarchief</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
                {[...(currentGroup.trips || [])]
                  .sort((a, b) => {
                    const da = a.trip_start_date || '0000'
                    const db2 = b.trip_start_date || '0000'
                    return db2.localeCompare(da) // newest first
                  })
                  .map(gt => {
                    const pts = participantsMap[gt.trip_id] || []
                    const going = pts.some(p => p.id === user?.id)
                    return (
                      <div key={gt.trip_id} className="flex items-center gap-3 px-4 py-3">
                        {gt.trip_cover_image ? (
                          <img src={gt.trip_cover_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                            <MapPin size={14} style={{ color: 'var(--text-faint)' }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => navigate(`/trips/${gt.trip_id}`)}
                            className="text-sm font-medium text-left hover:underline"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {gt.trip_title || `Reis #${gt.trip_id}`}
                          </button>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                            {gt.trip_start_date && (
                              <span>{gt.trip_start_date}{gt.trip_end_date ? ` – ${gt.trip_end_date}` : ''}</span>
                            )}
                            {pts.length > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Users size={9} />
                                {pts.length}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRsvp(gt.trip_id)}
                          disabled={!!rsvpLoading[gt.trip_id]}
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                          style={{
                            background: going ? 'var(--accent)' : 'var(--bg-secondary)',
                            color: going ? 'white' : 'var(--text-muted)',
                          }}
                        >
                          {rsvpLoading[gt.trip_id]
                            ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                            : <UserCheck size={10} />
                          }
                          {going ? 'Ik ga' : 'Ga mee?'}
                        </button>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Groepskaart */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <div className="flex items-center gap-2">
                <Globe size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Groepskaart</span>
              </div>
              {atlasCountries.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{atlasCountries.length} land{atlasCountries.length !== 1 ? 'en' : ''}</span>
              )}
            </div>
            {atlasCountries.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-faint)' }}>
                Voeg plaatsen toe aan reizen om landen op de kaart te zien.
              </div>
            ) : (
              <GroupMap countries={atlasCountries} height="280px" />
            )}
          </div>

          {/* Date availability proposals */}
          <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <DateAvailabilityV2
              groupId={currentGroup.id}
              canCreate={canManageMembers || (currentGroup.role === 'member')}
              isAdmin={canManageMembers}
            />
          </div>

          {/* Destination polls — one section per trip in group */}
          {(currentGroup.trips || []).map(gt => (
            <div key={gt.trip_id} className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
              <GroupPolls
                tripId={gt.trip_id}
                tripTitle={(currentGroup.trips || []).length > 1 ? (gt.trip_title || undefined) : undefined}
                canCreate={canManageMembers || (currentGroup.role === 'member')}
              />
            </div>
          ))}

          {/* Prikbord */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <span style={{ fontSize: 14 }}>💡</span>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Prikbord</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {ideas.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Nog geen ideeën. Voeg een reisidee toe!</p>
              )}
              {ideas.map(idea => (
                <div key={idea.id} className="flex items-start gap-2 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{idea.title}</p>
                    {idea.body && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{idea.body}</p>}
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{idea.username} · {new Date(idea.created_at).toLocaleDateString()}</p>
                  </div>
                  {(idea.user_id === user?.id || canManageMembers) && (
                    <button onClick={() => handleDeleteIdea(idea.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100" style={{ color: '#dc2626' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: 'var(--border-faint)' }}>
                <input
                  value={newIdeaTitle} onChange={e => setNewIdeaTitle(e.target.value)}
                  placeholder="Nieuw idee…" maxLength={200}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddIdea()}
                  className="text-sm px-3 py-2 rounded-lg border w-full"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                />
                <textarea
                  value={newIdeaBody} onChange={e => setNewIdeaBody(e.target.value)}
                  placeholder="Toelichting (optioneel)…" maxLength={1000} rows={2}
                  className="text-sm px-3 py-2 rounded-lg border w-full resize-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={handleAddIdea} disabled={savingIdea || !newIdeaTitle.trim()}
                  className="self-end px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                  {savingIdea ? '…' : 'Voeg toe'}
                </button>
              </div>
            </div>
          </div>

          {/* Taakverdeling */}
          <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <span style={{ fontSize: 14 }}>✅</span>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Taken</span>
              {tasks.length > 0 && (
                <span className="ml-auto text-xs" style={{ color: 'var(--text-faint)' }}>
                  {tasks.filter(t => t.done).length}/{tasks.length} gedaan
                </span>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2">
              {tasks.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Nog geen taken. Voeg een taak toe!</p>
              )}
              {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 group">
                  <button onClick={() => handleToggleTask(task.id, task.done)} className="flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors"
                    style={{ borderColor: task.done ? 'var(--accent)' : 'var(--border-primary)', background: task.done ? 'var(--accent)' : 'transparent' }}>
                    {task.done ? <Check size={10} style={{ color: 'var(--accent-text)' }} /> : null}
                  </button>
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)', textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.5 : 1 }}>
                    {task.title}
                  </span>
                  {task.assigned_username && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--text-faint)' }}>
                      {task.assigned_username}
                    </span>
                  )}
                  {(task.created_by === user?.id || canManageMembers) && (
                    <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100" style={{ color: '#dc2626' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 border-t pt-3 items-end" style={{ borderColor: 'var(--border-faint)' }}>
                <input
                  value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Nieuwe taak…" maxLength={200}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddTask()}
                  className="flex-1 text-sm px-3 py-2 rounded-lg border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
                />
                <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value === '' ? '' : Number(e.target.value))}
                  className="text-sm px-2 py-2 rounded-lg border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}>
                  <option value="">Niemand</option>
                  {(currentGroup.members || []).map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.username}</option>
                  ))}
                </select>
                <button onClick={handleAddTask} disabled={savingTask || !newTaskTitle.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0 disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
                  {savingTask ? '…' : '+'}
                </button>
              </div>
            </div>
          </div>

          {/* Activiteitenfeed */}
          {activityFeed.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
                <Activity size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Activiteit</span>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
                {activityFeed.map(ev => {
                  const actor = ev.actor_name || 'Iemand'
                  const labels: Record<string, string> = {
                    member_added: `${actor} heeft een lid toegevoegd`,
                    trip_added: `${actor} heeft een reis toegevoegd`,
                    trip_removed: `${actor} heeft een reis verwijderd`,
                    member_left: `${actor} heeft de groep verlaten`,
                  }
                  const label = labels[ev.event_type] || ev.event_type
                  const date = new Date(ev.created_at)
                  const dateStr = date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
                  return (
                    <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'var(--bg-secondary)' }}>
                        <Activity size={10} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
                          {label}
                          {ev.resource_title && (
                            <span className="font-medium"> "{ev.resource_title}"</span>
                          )}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{dateStr}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {activityHasMore && (
                <button
                  onClick={handleLoadMoreActivity}
                  disabled={activityLoading}
                  className="w-full py-2.5 text-xs font-medium border-t transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}
                >
                  {activityLoading ? 'Laden…' : 'Meer laden'}
                </button>
              )}
            </div>
          )}

          {/* No trips — show create/add prompt */}
          {(currentGroup.trips || []).length === 0 && (
            <div className="rounded-xl border p-4 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)' }}>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {t('groups.polls.noTripsForPolls') || 'Voeg een reis toe om bestemmingen voor te stellen en te stemmen.'}
              </p>
            </div>
          )}
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

      {/* Add Trip Modal */}
      <Modal
        isOpen={showAddTrip}
        onClose={() => { setShowAddTrip(false); setAvailableTrips([]); setSelectedTrip(null) }}
        title={selectedTrip ? (t('groups.addTrip.shareOrClone') || 'Share or Clone') : (t('groups.addTrip') || 'Add Trip')}
        size="md"
      >
        {selectedTrip ? (
          /* Share / Clone choice */
          <div className="space-y-3">
            <button
              onClick={() => setSelectedTrip(null)}
              className="flex items-center gap-1.5 text-xs mb-1 transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              <ChevronLeft size={13} />
              {t('common.back') || 'Back'}
            </button>

            <div className="flex items-center gap-3 p-3 rounded-lg mb-2" style={{ background: 'var(--bg-secondary)' }}>
              {selectedTrip.cover_image ? (
                <img src={selectedTrip.cover_image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-card)' }}>
                  <CalendarDays size={14} style={{ color: 'var(--text-faint)' }} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{selectedTrip.title}</p>
                {(selectedTrip.start_date || selectedTrip.end_date) && (
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    {selectedTrip.start_date || ''}{selectedTrip.start_date && selectedTrip.end_date ? ' – ' : ''}{selectedTrip.end_date || ''}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={handleShareOriginal}
              disabled={shareCloneLoading}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            >
              <Link2 size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('groups.addTrip.shareOriginal') || 'Share original'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('groups.addTrip.shareOriginalDesc') || 'All group members see and can edit the same trip.'}</p>
              </div>
            </button>

            <button
              onClick={handleCloneTrip}
              disabled={shareCloneLoading}
              className="w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            >
              {shareCloneLoading
                ? <div className="w-4.5 h-4.5 mt-0.5 flex-shrink-0 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
                : <Copy size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              }
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('groups.addTrip.cloneTrip') || 'Make a copy'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t('groups.addTrip.cloneTripDesc') || 'Creates an independent copy; changes won\'t affect the original.'}</p>
              </div>
            </button>
          </div>
        ) : (
          /* Trip list */
          <div className="space-y-3">
            {tripsLoading && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
              </div>
            )}

            <button
              onClick={() => { setShowAddTrip(false); setShowCreateTripForGroup(true) }}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <Plus size={14} />
              {t('groups.addTrip.createNew') || 'Create new trip'}
            </button>

            {!tripsLoading && availableTrips.length === 0 && (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-faint)' }}>
                {t('groups.noTripsAvailable') || 'No trips available to add.'}
              </p>
            )}

            <div className="space-y-1 max-h-64 overflow-y-auto">
              {availableTrips.map(trip => (
                <button
                  key={trip.id}
                  onClick={() => setSelectedTrip(trip)}
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
        )}
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
              style={{ background: '#ef4444' }}
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

      {/* Leave Group Confirm Modal */}
      <Modal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        title={t('groups.leaveConfirm.title') || 'Leave Group'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowLeaveConfirm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleLeaveGroup}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: '#ef4444' }}
            >
              {t('groups.leave') || 'Leave'}
            </button>
          </div>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('groups.leaveConfirm.body', { name: currentGroup?.name || '' }) || `Are you sure you want to leave ${currentGroup?.name}?`}
        </p>
      </Modal>

      {/* Create Trip for Group */}
      <TripFormModal
        isOpen={showCreateTripForGroup}
        onClose={() => setShowCreateTripForGroup(false)}
        onSave={handleCreateTripForGroup}
        trip={null}
        onCoverUpdate={() => {}}
      />

      {/* Admin reassignment modal */}
      <Modal
        isOpen={showAdminReassignModal}
        onClose={() => { setShowAdminReassignModal(false); setSelectedNewAdmin(null) }}
        title={t('groups.admin.reassignTitle') || 'Select Replacement Admin'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAdminReassignModal(false); setSelectedNewAdmin(null) }}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleLeaveAsAdmin}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              {t('groups.admin.promoteAndLeave') || 'Promote & Leave'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('groups.admin.reassignBody') || 'As an admin, please select a member to promote to admin before leaving.'}
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(currentGroup?.members || [])
              .filter(m => m.user_id !== user?.id && m.role !== 'admin')
              .map(member => (
                <button
                  key={member.user_id}
                  onClick={() => setSelectedNewAdmin(member.user_id)}
                  className="w-full text-left p-3 rounded-lg border transition-colors"
                  style={{
                    background: selectedNewAdmin === member.user_id ? 'var(--accent)' : 'var(--bg-secondary)',
                    borderColor: selectedNewAdmin === member.user_id ? 'var(--accent)' : 'var(--border-primary)',
                    color: selectedNewAdmin === member.user_id ? 'white' : 'var(--text-primary)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    {member.avatar ? (
                      <img src={member.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
                        <User size={12} />
                      </div>
                    )}
                    <span className="text-sm font-medium">{member.username}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      </Modal>

      {/* Invite link creation modal */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title={t('admin.invite.create')} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Rechten</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setInviteForm(f => ({ ...f, role: 'member' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  inviteForm.role === 'member' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}>
                Kan bewerken
              </button>
              <button type="button" onClick={() => setInviteForm(f => ({ ...f, role: 'viewer' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  inviteForm.role === 'viewer' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}>
                Alleen lezen
              </button>
            </div>
          </div>
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

      {/* Edit participants modal */}
      <Modal
        isOpen={editParticipantsTripId !== null}
        onClose={() => setEditParticipantsTripId(null)}
        title="Wie ging er mee?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEditParticipantsTripId(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
            >
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleSaveParticipants}
              disabled={editParticipantsSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {editParticipantsSaving ? '...' : (t('common.save') || 'Save')}
            </button>
          </div>
        }
      >
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {(currentGroup?.members || []).map(member => (
            <button
              key={member.user_id}
              onClick={() => setEditParticipantsSelected(prev => {
                const next = new Set(prev)
                if (next.has(member.user_id)) next.delete(member.user_id)
                else next.add(member.user_id)
                return next
              })}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors"
              style={{ background: editParticipantsSelected.has(member.user_id) ? 'var(--accent-soft, var(--bg-secondary))' : 'var(--bg-secondary)' }}
            >
              <div
                className="w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center"
                style={{
                  borderColor: editParticipantsSelected.has(member.user_id) ? 'var(--accent)' : 'var(--border-primary)',
                  background: editParticipantsSelected.has(member.user_id) ? 'var(--accent)' : 'transparent',
                }}
              >
                {editParticipantsSelected.has(member.user_id) && <Check size={10} color="white" />}
              </div>
              {member.avatar
                ? <img src={member.avatar} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                : <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}>{member.username?.[0]?.toUpperCase()}</div>
              }
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{member.username}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{t(`groups.role.${member.role}`) || member.role}</p>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
