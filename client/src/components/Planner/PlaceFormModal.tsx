import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { isAdminRole } from '../../types'
import Modal from '../shared/Modal'
import CustomSelect from '../shared/CustomSelect'
import { mapsApi } from '../../api/client'
import { useAuthStore } from '../../store/authStore'
import { useCanDo } from '../../store/permissionsStore'
import { useTripStore } from '../../store/tripStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useToast } from '../shared/Toast'
import { Search, Paperclip, X, AlertTriangle, Loader2, Camera, Trash2 } from 'lucide-react'
import { useTranslation } from '../../i18n'
import CustomTimePicker from '../shared/CustomTimePicker'
import type { Place, Category, Assignment } from '../../types'
import { placesApi } from '../../api/client'

const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK',
  'TRY', 'THB', 'AUD', 'CAD', 'NZD', 'BRL', 'MXN', 'INR', 'IDR', 'MYR',
  'PHP', 'SGD', 'KRW', 'CNY', 'HKD', 'TWD', 'ZAR', 'AED', 'SAR', 'ILS',
  'EGP', 'MAD', 'HUF', 'RON', 'BGN', 'HRK', 'ISK', 'RUB', 'UAH', 'BDT',
  'LKR', 'VND', 'CLP', 'COP', 'PEN', 'ARS',
]

interface PlaceFormData {
  name: string
  description: string
  address: string
  lat: string
  lng: string
  category_id: string
  place_time: string
  end_time: string
  notes: string
  transport_mode: string
  website: string
  price: string
  price_type: string
  currency: string
  google_place_id?: string
  osm_id?: string
  phone?: string
}

function isGoogleMapsUrl(input: string): boolean {
  try {
    const { hostname, pathname } = new URL(input.trim())
    const h = hostname.toLowerCase()
    // maps.app.goo.gl, goo.gl/maps
    if (h === 'maps.app.goo.gl') return true
    if (h === 'goo.gl' && pathname.startsWith('/maps')) return true
    // maps.google.* (e.g. maps.google.com, maps.google.co.uk)
    // Must be maps.google.<tld> or maps.google.<sld>.<tld> — reject maps.google.evil.com
    if (/^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)) return true
    // google.*/maps (e.g. google.com/maps, www.google.co.uk/maps)
    const bare = h.startsWith('www.') ? h.slice(4) : h
    if (/^google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(bare) && pathname.startsWith('/maps')) return true
    return false
  } catch {
    return false
  }
}

const DEFAULT_FORM: PlaceFormData = {
  name: '',
  description: '',
  address: '',
  lat: '',
  lng: '',
  category_id: '',
  place_time: '',
  end_time: '',
  notes: '',
  transport_mode: 'walking',
  website: '',
  price: '',
  price_type: 'total',
  currency: '',
}

interface PlaceFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: Omit<PlaceFormData, 'lat' | 'lng' | 'price' | 'price_type' | 'currency' | 'category_id'> & { lat: number | null; lng: number | null; price: number | null; price_type: string | null; currency: string | null; category_id: string | null; _pendingFiles?: File[] }) => Promise<void> | void
  onPhotoChange?: (placeId: number, imageUrl: string | null) => void
  place: Place | null
  prefillCoords?: { lat: number; lng: number; name?: string; address?: string } | null
  tripId: number
  categories: Category[]
  onCategoryCreated?: (category: Partial<Category> & { name: string }) => Promise<Category | undefined> | void
  assignmentId: number | null
  dayAssignments?: Assignment[]
}

// Helper function to map Google Places API types to ROUTD categories
function mapGoogleTypesToCategory(googleTypes: string[] = [], existingCategories: Category[]): string | null {
  if (!googleTypes || googleTypes.length === 0) return null

  // Define mapping of Google types to ROUTD category names
  const typeToCategoryMap: Record<string, string> = {
    // Tourist attractions & landmarks
    'tourist_attraction': 'Landmark',
    'landmark': 'Landmark',
    'point_of_interest': 'Landmark',
    'museum': 'Museum',
    'art_gallery': 'Museum',
    'church': 'Church',
    'place_of_worship': 'Church',
    'temple': 'Church',
    'mosque': 'Church',
    'synagogue': 'Church',
    'park': 'Park',
    'national_park': 'Park',
    'zoo': 'Zoo',
    'amusement_park': 'Theme Park',
    'aquarium': 'Aquarium',
    'historical_landmark': 'Historical Site',
    'monument': 'Monument',
    'castle': 'Castle',
    'palace': 'Palace',
    
    // Food & restaurants
    'restaurant': 'Restaurant',
    'cafe': 'Cafe',
    'bakery': 'Bakery',
    'bar': 'Bar',
    'night_club': 'Night Club',
    'meal_takeaway': 'Takeaway',
    'meal_delivery': 'Delivery',
    'food': 'Food',
    
    // Shopping
    'shopping_mall': 'Shopping Mall',
    'store': 'Shop',
    'clothing_store': 'Clothing Store',
    'supermarket': 'Supermarket',
    'grocery': 'Grocery',
    'department_store': 'Department Store',
    'convenience_store': 'Convenience Store',
    'book_store': 'Book Store',
    'jewelry_store': 'Jewelry Store',
    'shoe_store': 'Shoe Store',
    'electronics_store': 'Electronics Store',
    'home_goods_store': 'Home Goods',
    
    // Accommodation
    'lodging': 'Hotel',
    'hotel': 'Hotel',
    'motel': 'Motel',
    'hostel': 'Hostel',
    'bed_and_breakfast': 'B&B',
    'resort': 'Resort',
    'campground': 'Campground',
    'rv_park': 'RV Park',
    
    // Transportation
    'airport': 'Airport',
    'bus_station': 'Bus Station',
    'train_station': 'Train Station',
    'subway_station': 'Subway',
    'transit_station': 'Transit Station',
    'taxi_stand': 'Taxi Stand',
    'parking': 'Parking',
    'gas_station': 'Gas Station',
    'car_rental': 'Car Rental',
    'car_wash': 'Car Wash',
    
    // Outdoor & nature
    'beach': 'Beach',
    'mountain': 'Mountain',
    'lake': 'Lake',
    'river': 'River',
    'garden': 'Garden',
    'hiking_area': 'Hiking',
    'ski_resort': 'Ski Resort',
    'beach_resort': 'Beach Resort',
    
    // Business & services
    'bank': 'Bank',
    'atm': 'ATM',
    'hospital': 'Hospital',
    'doctor': 'Doctor',
    'pharmacy': 'Pharmacy',
    'school': 'School',
    'university': 'University',
    'library': 'Library',
    'city_hall': 'City Hall',
    'courthouse': 'Courthouse',
    'post_office': 'Post Office',
    'embassy': 'Embassy',
    'police': 'Police',
    'fire_station': 'Fire Station',
    'local_government_office': 'Government Office',
    
    // Entertainment
    'movie_theater': 'Cinema',
    'theater': 'Theater',
    'concert_hall': 'Concert Hall',
    'bowling_alley': 'Bowling',
    'stadium': 'Stadium',
    'gym': 'Gym',
    'spa': 'Spa',
    'casino': 'Casino',
    
    // Default fallback
    'establishment': 'Place',
    'locality': 'City',
    'neighborhood': 'Neighborhood',
  }

  // Create reverse mapping for quick lookup by existing category name
  const existingCategoryMap = new Map(existingCategories.map(cat => [cat.name.toLowerCase(), cat.id]))
  
  // Try to find a direct match from Google types to existing ROUTD categories
  for (const googleType of googleTypes) {
    const mappedName = typeToCategoryMap[googleType]
    if (mappedName) {
      // Check if this category already exists in ROUTD
      const existingId = existingCategoryMap.get(mappedName.toLowerCase())
      if (existingId) {
        return String(existingId)
      }
    }
  }
  
  // If no existing category matched, suggest creating the first valid mapped category
  for (const googleType of googleTypes) {
    const mappedName = typeToCategoryMap[googleType]
    if (mappedName) {
      return null // Signal that a new category should be created
    }
  }
  
  return null // No matching category found
}

export default function PlaceFormModal({
  isOpen, onClose, onSave, onPhotoChange, place, prefillCoords, tripId, categories,
  onCategoryCreated, assignmentId, dayAssignments = [],
}: PlaceFormModalProps) {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [mapsSearch, setMapsSearch] = useState('')
  const [mapsResults, setMapsResults] = useState([])
  const [isSearchingMaps, setIsSearchingMaps] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [unsplashPhotos, setUnsplashPhotos] = useState<any[]>([])
  const [isUnsplashModalOpen, setIsUnsplashModalOpen] = useState(false)
  const [unsplashQuery, setUnsplashQuery] = useState('')
  const fileRef = useRef(null)
  const photoRef = useRef(null)
  const [acSuggestions, setAcSuggestions] = useState<{ placeId: string; mainText: string; secondaryText: string }[]>([])
  const [acHighlight, setAcHighlight] = useState(-1)
  const acDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const acAbortRef = useRef<AbortController | null>(null)
  const toast = useToast()
  const { t, language } = useTranslation()
  const { hasMapsKey, user: currentUser } = useAuthStore()
  const can = useCanDo()
  const tripObj = useTripStore((s) => s.trip)
  const canUploadFiles = can('file_upload', tripObj)
  const defaultCurrency = useSettingsStore((s) => s.settings.default_currency) || 'EUR'

  useEffect(() => {
    if (place) {
      setForm({
        name: place.name || '',
        description: place.description || '',
        address: place.address || '',
        lat: place.lat != null ? String(place.lat) : '',
        lng: place.lng != null ? String(place.lng) : '',
        category_id: place.category_id != null ? String(place.category_id) : '',
        place_time: place.place_time || '',
        end_time: place.end_time || '',
        notes: place.notes || '',
        transport_mode: place.transport_mode || 'walking',
        website: place.website || '',
        phone: place.phone || '',
        price: place.price != null ? String(place.price) : '',
        price_type: (place as { price_type?: string }).price_type || 'total',
        currency: place.currency || defaultCurrency,
      })
    } else if (prefillCoords) {
      setForm({
        ...DEFAULT_FORM,
        lat: String(prefillCoords.lat),
        lng: String(prefillCoords.lng),
        name: prefillCoords.name || '',
        address: prefillCoords.address || '',
        currency: defaultCurrency,
      })
    } else {
      setForm({ ...DEFAULT_FORM, currency: defaultCurrency, price_type: 'total' })
    }
    setMapsSearch('')
    setMapsResults([])
    setAcSuggestions([])
    setPendingFiles([])
  }, [place, prefillCoords, isOpen, defaultCurrency])

  // Derive location bias bounding box from the trip's existing places
  const places = useTripStore((s) => s.places)

  // Helper function to check if a place already exists in the trip
  const isPlaceInList = useCallback((result: any): boolean => {
    if (!places || places.length === 0) return false
    
    // Check by google_place_id (most reliable)
    if (result.google_place_id) {
      const exists = places.some(p => p.google_place_id === result.google_place_id)
      if (exists) return true
    }
    
    // Check by osm_id
    if (result.osm_id) {
      const exists = places.some(p => p.osm_id === result.osm_id)
      if (exists) return true
    }
    
    // Fallback: check by name and coordinates
    if (result.name && result.lat && result.lng) {
      const exists = places.some(p =>
        p.name === result.name &&
        p.lat === result.lat &&
        p.lng === result.lng
      )
      if (exists) return true
    }
    
    return false
  }, [places])
  const locationBias = useMemo(() => {
    const withCoords = (places || []).filter((p) => p.lat != null && p.lng != null)
    if (withCoords.length === 0) return undefined

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const p of withCoords) {
      const lat = Number(p.lat), lng = Number(p.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
    if (!Number.isFinite(minLat)) return undefined

    // Skip bias if the bounding box is too large (~500 km diagonal)
    const dlat = maxLat - minLat
    const dlng = maxLng - minLng
    const avgLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180)
    const diagKm = Math.sqrt((dlat * 111) ** 2 + (dlng * 111 * Math.cos(avgLatRad)) ** 2)
    if (diagKm > 500) return undefined

    return { low: { lat: minLat, lng: minLng }, high: { lat: maxLat, lng: maxLng } }
  }, [places])

  // Autocomplete fetch — aborts any in-flight request before starting a new one
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2 || isGoogleMapsUrl(query)) {
      setAcSuggestions([])
      setAcHighlight(-1)
      return
    }
    acAbortRef.current?.abort()
    const controller = new AbortController()
    acAbortRef.current = controller
    try {
      const result = await mapsApi.autocomplete(query, language, locationBias, controller.signal)
      setAcSuggestions(result.suggestions || [])
      setAcHighlight(-1)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'CanceledError') return // axios abort
      console.error('Autocomplete failed:', err)
      setAcSuggestions([])
    }
  }, [language, locationBias])

  // Debounce effect — only watches mapsSearch
  useEffect(() => {
    if (acDebounceRef.current) clearTimeout(acDebounceRef.current)

    const trimmed = mapsSearch.trim()
    if (trimmed.length < 2 || isGoogleMapsUrl(trimmed)) {
      setAcSuggestions([])
      setAcHighlight(-1)
      return
    }

    acDebounceRef.current = setTimeout(() => fetchSuggestions(trimmed), 300)

    return () => {
      if (acDebounceRef.current) clearTimeout(acDebounceRef.current)
    }
  }, [mapsSearch, fetchSuggestions])

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleMapsSearch = async () => {
    if (!mapsSearch.trim()) return
    setIsSearchingMaps(true)
    try {
      // Detect Google Maps URLs and resolve them directly
      const trimmed = mapsSearch.trim()
      if (isGoogleMapsUrl(trimmed)) {
        const resolved = await mapsApi.resolveUrl(trimmed)
        if (resolved.lat && resolved.lng) {
          setForm(prev => ({
            ...prev,
            name: resolved.name || prev.name,
            address: resolved.address || prev.address,
            lat: String(resolved.lat),
            lng: String(resolved.lng),
          }))
          setMapsResults([])
          setMapsSearch('')
          toast.success(t('places.urlResolved'))
          return
        }
      }
      const result = await mapsApi.search(mapsSearch, language)
      const searchResults = result.places || []
      // Filter out places that are already in the trip
      const filteredResults = searchResults.filter((place: any) => !isPlaceInList(place))
      setMapsResults(filteredResults)
      
      // Notify user if some results were filtered out
      if (searchResults.length > 0 && filteredResults.length === 0) {
        toast.info(t('places.allPlacesAlreadyInList'))
      } else if (searchResults.length > filteredResults.length) {
        const filteredCount = searchResults.length - filteredResults.length
        toast.info(t('places.filteredExistingPlaces', { count: filteredCount }))
      }
    } catch (err: unknown) {
      toast.error(t('places.mapsSearchError'))
    } finally {
      setIsSearchingMaps(false)
    }
  }

  const handleSelectMapsResult = async (result) => {
    // Try to automatically assign a category based on Google Places types
    let autoCategoryId = null
    if (result.types && result.types.length > 0 && categories) {
      const mappedCategoryId = mapGoogleTypesToCategory(result.types, categories)
      if (mappedCategoryId) {
        autoCategoryId = mappedCategoryId
      } else {
        // Check if we should create a new category
        const typeToCategoryMap: Record<string, string> = {
          'tourist_attraction': 'Landmark', 'landmark': 'Landmark', 'point_of_interest': 'Landmark',
          'museum': 'Museum', 'art_gallery': 'Museum', 'church': 'Church', 'place_of_worship': 'Church',
          'temple': 'Church', 'mosque': 'Church', 'synagogue': 'Church', 'park': 'Park',
          'national_park': 'Park', 'zoo': 'Zoo', 'amusement_park': 'Theme Park', 'aquarium': 'Aquarium',
          'historical_landmark': 'Historical Site', 'monument': 'Monument', 'castle': 'Castle',
          'palace': 'Palace', 'restaurant': 'Restaurant', 'cafe': 'Cafe', 'bakery': 'Bakery',
          'bar': 'Bar', 'night_club': 'Night Club', 'meal_takeaway': 'Takeaway',
          'meal_delivery': 'Delivery', 'food': 'Food', 'shopping_mall': 'Shopping Mall',
          'store': 'Shop', 'clothing_store': 'Clothing Store', 'supermarket': 'Supermarket',
          'grocery': 'Grocery', 'department_store': 'Department Store',
          'convenience_store': 'Convenience Store', 'book_store': 'Book Store',
          'jewelry_store': 'Jewelry Store', 'shoe_store': 'Shoe Store',
          'electronics_store': 'Electronics Store', 'home_goods_store': 'Home Goods',
          'lodging': 'Hotel', 'hotel': 'Hotel', 'motel': 'Motel', 'hostel': 'Hostel',
          'bed_and_breakfast': 'B&B', 'resort': 'Resort', 'campground': 'Campground',
          'rv_park': 'RV Park', 'airport': 'Airport', 'bus_station': 'Bus Station',
          'train_station': 'Train Station', 'subway_station': 'Subway',
          'transit_station': 'Transit Station', 'taxi_stand': 'Taxi Stand',
          'parking': 'Parking', 'gas_station': 'Gas Station', 'car_rental': 'Car Rental',
          'car_wash': 'Car Wash', 'beach': 'Beach', 'mountain': 'Mountain',
          'lake': 'Lake', 'river': 'River', 'garden': 'Garden', 'hiking_area': 'Hiking',
          'ski_resort': 'Ski Resort', 'beach_resort': 'Beach Resort', 'bank': 'Bank',
          'atm': 'ATM', 'hospital': 'Hospital', 'doctor': 'Doctor', 'pharmacy': 'Pharmacy',
          'school': 'School', 'university': 'University', 'library': 'Library',
          'city_hall': 'City Hall', 'courthouse': 'Courthouse', 'post_office': 'Post Office',
          'embassy': 'Embassy', 'police': 'Police', 'fire_station': 'Fire Station',
          'local_government_office': 'Government Office', 'movie_theater': 'Cinema',
          'theater': 'Theater', 'concert_hall': 'Concert Hall', 'bowling_alley': 'Bowling',
          'stadium': 'Stadium', 'gym': 'Gym', 'spa': 'Spa', 'casino': 'Casino',
          'establishment': 'Place', 'locality': 'City', 'neighborhood': 'Neighborhood',
        }
        
        for (const googleType of result.types) {
          const mappedName = typeToCategoryMap[googleType]
          if (mappedName) {
            // Create new category
            try {
              const newCat = await onCategoryCreated?.({ name: mappedName, color: '#6366f1', icon: 'MapPin' })
              if (newCat) {
                autoCategoryId = String(newCat.id)
              }
            } catch (err) {
              console.error('Failed to create category:', err)
            }
            break
          }
        }
      }
    }
    
    setForm(prev => ({
      ...prev,
      name: result.name || prev.name,
      address: result.address || prev.address,
      lat: result.lat || prev.lat,
      lng: result.lng || prev.lng,
      google_place_id: result.google_place_id || prev.google_place_id,
      osm_id: result.osm_id || prev.osm_id,
      website: result.website || prev.website,
      phone: result.phone || prev.phone,
      category_id: autoCategoryId || prev.category_id,
    }))
    setMapsResults([])
    setMapsSearch('')
  }

  const handleSelectSuggestion = async (suggestion: { placeId: string; mainText: string; secondaryText: string }) => {
    setAcSuggestions([])
    setAcHighlight(-1)
    const previousSearch = mapsSearch
    setMapsSearch('')
    setForm(prev => ({ ...prev, name: suggestion.mainText }))
    setIsSearchingMaps(true)
    try {
      const result = await mapsApi.details(suggestion.placeId, language)
      if (result.place) {
        handleSelectMapsResult(result.place)
      } else {
        setMapsSearch(previousSearch)
        toast.error(t('places.mapsSearchError'))
      }
    } catch (err) {
      console.error('Failed to fetch place details:', err)
      setMapsSearch(previousSearch)
      toast.error(t('places.mapsSearchError'))
    } finally {
      setIsSearchingMaps(false)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (acSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAcHighlight(prev => (prev + 1) % acSuggestions.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAcHighlight(prev => (prev <= 0 ? acSuggestions.length - 1 : prev - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (acHighlight >= 0) {
          handleSelectSuggestion(acSuggestions[acHighlight])
        } else {
          setAcSuggestions([])
          handleMapsSearch()
        }
      } else if (e.key === 'Escape') {
        setAcSuggestions([])
        setAcHighlight(-1)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleMapsSearch()
    }
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      const cat = await onCategoryCreated?.({ name: newCategoryName, color: '#6366f1', icon: 'MapPin' })
      if (cat) setForm(prev => ({ ...prev, category_id: String(cat.id) }))
      setNewCategoryName('')
      setShowNewCategory(false)
    } catch (err: unknown) {
      toast.error(t('places.categoryCreateError'))
    }
  }

  const handleFileAdd = (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || [])
    setPendingFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  const handleRemoveFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handlePhotoAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !place) return

    const formData = new FormData()
    formData.append('photo', file)

    try {
      const result = await placesApi.uploadPhoto(tripId, place.id, formData)
      if (result.place) {
        toast.success(t('places.photoUploaded'))
        onPhotoChange?.(place.id, result.place.image_url)
      }
    } catch (err: unknown) {
      toast.error(t('places.photoUploadError'))
    }
    e.target.value = ''
  }

  const handlePhotoDelete = async () => {
    if (!place) return

    try {
      await placesApi.deletePhoto(tripId, place.id)
      toast.success(t('places.photoDeleted'))
      onPhotoChange?.(place.id, null)
    } catch (err: unknown) {
      toast.error(t('places.photoDeleteError'))
    }
  }

  const handleSearchUnsplash = useCallback(async (query?: string) => {
    if (!place) return
    const q = query || unsplashQuery
    if (!q.trim() && !place.name) return
    try {
      const result = await placesApi.searchImage(tripId, place.id, q.trim() || undefined)
      setUnsplashPhotos(result.photos || [])
    } catch (error: unknown) {
      console.error('Failed to search Unsplash:', error)
      toast.error(t('places.unsplashSearchError'))
    }
  }, [unsplashQuery, place, tripId, t])

  const handleSelectUnsplashImage = async (url: string) => {
    if (!place) return
    try {
      const result = await placesApi.setImage(tripId, place.id, url)
      if (result.place) {
        toast.success(t('places.photoUploaded'))
        onPhotoChange?.(place.id, result.place.image_url)
      }
      setIsUnsplashModalOpen(false)
      setUnsplashPhotos([])
    } catch (err: unknown) {
      toast.error(t('places.photoUploadError'))
    }
  }

  // Paste support for files/images
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!canUploadFiles) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items) as DataTransferItem[]) {
      if (item.type.startsWith('image/') || item.type === 'application/pdf') {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) setPendingFiles(prev => [...prev, file])
        return
      }
    }
  }

  const hasTimeError = place && form.place_time && form.end_time && form.place_time.length >= 5 && form.end_time.length >= 5 && form.end_time <= form.place_time

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error(t('places.nameRequired'))
      return
    }
    setIsSaving(true)
    try {
      await onSave({
        ...form,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        category_id: form.category_id || null,
        price: form.price ? parseFloat(form.price) : null,
        price_type: form.price ? (form.price_type || 'total') : null,
        currency: form.currency || null,
        _pendingFiles: pendingFiles.length > 0 ? pendingFiles : undefined,
      })
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('places.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={place ? t('places.editPlace') : t('places.addPlace')}
      size="lg"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving || hasTimeError}
            className="px-6 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-60 font-medium"
          >
            {isSaving ? t('common.saving') : place ? t('common.update') : t('common.add')}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" onPaste={handlePaste}>
        {/* Place Search */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          {!hasMapsKey && isAdminRole(currentUser?.role) && (
            <div className="mb-2 flex items-start gap-1.5 rounded-md px-2 py-1.5" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-[10px] font-medium" style={{ color: '#d97706' }}>{t('places.osmActive')}</span>
            </div>
          )}
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={mapsSearch}
                onChange={e => setMapsSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={() => setTimeout(() => setAcSuggestions([]), 150)}
                onFocus={() => {
                  if (mapsSearch.trim().length >= 2 && acSuggestions.length === 0 && mapsResults.length === 0) {
                    fetchSuggestions(mapsSearch.trim())
                  }
                }}
                placeholder={t('places.mapsSearchPlaceholder')}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
              />
              <button
                type="button"
                onClick={() => { setAcSuggestions([]); handleMapsSearch() }}
                disabled={isSearchingMaps}
                className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-slate-700 disabled:opacity-60"
              >
                {isSearchingMaps ? '...' : <Search className="w-4 h-4" />}
              </button>
            </div>

            {/* Autocomplete dropdown */}
            {acSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-1 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
                {acSuggestions.map((s, idx) => (
                  <button
                    key={s.placeId}
                    type="button"
                    onMouseDown={() => handleSelectSuggestion(s)}
                    onMouseEnter={() => setAcHighlight(idx)}
                    className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${
                      idx === acHighlight ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-medium text-sm">{s.mainText}</div>
                    {s.secondaryText && (
                      <div className="text-xs text-slate-500 truncate">{s.secondaryText}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search results (populated after full search) */}
          {mapsResults.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-h-40 overflow-y-auto mt-2">
              {mapsResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectMapsResult(result)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <div className="font-medium text-sm">{result.name}</div>
                  <div className="text-xs text-slate-500 truncate">{result.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formName')} *</label>
          <div className="relative">
            <input
              type="text"
              value={form.name}
              onChange={e => handleChange('name', e.target.value)}
              required
              placeholder={t('places.formNamePlaceholder')}
              className="form-input"
            />
            {isSearchingMaps && (
              <div className="absolute right-2.5 top-0 bottom-0 flex items-center" role="status" aria-label={t('places.loadingDetails')}>
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formDescription')}</label>
          <textarea
            value={form.description}
            onChange={e => handleChange('description', e.target.value)}
            rows={2}
            placeholder={t('places.formDescriptionPlaceholder')}
            className="form-input" style={{ resize: 'vertical' }}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formNotes')}</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('places.formNotesPlaceholder')}
            className="form-input" style={{ resize: 'vertical' }}
          />
        </div>

        {/* Address + Coordinates */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formAddress')}</label>
          <input
            type="text"
            value={form.address}
            onChange={e => handleChange('address', e.target.value)}
            placeholder={t('places.formAddressPlaceholder')}
            className="form-input"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              type="number"
              step="any"
              value={form.lat}
              onChange={e => handleChange('lat', e.target.value)}
              onPaste={e => {
                const text = e.clipboardData.getData('text').trim()
                const match = text.match(/^(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)$/)
                if (match) {
                  e.preventDefault()
                  handleChange('lat', match[1])
                  handleChange('lng', match[2])
                }
              }}
              placeholder={t('places.formLat')}
              className="form-input"
            />
            <input
              type="number"
              step="any"
              value={form.lng}
              onChange={e => handleChange('lng', e.target.value)}
              placeholder={t('places.formLng')}
              className="form-input"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formCategory')}</label>
          {!showNewCategory ? (
            <div className="flex gap-2">
              <CustomSelect
                value={form.category_id}
                onChange={value => handleChange('category_id', value)}
                placeholder={t('places.noCategory')}
                options={[
                  { value: '', label: t('places.noCategory') },
                  ...(categories || []).map(c => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
                style={{ flex: 1 }}
                size="sm"
              />
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder={t('places.categoryNamePlaceholder')}
                className="form-input" style={{ flex: 1 }}
              />
              <button type="button" onClick={handleCreateCategory} className="bg-slate-900 text-white px-3 rounded-lg hover:bg-slate-700 text-sm">
                OK
              </button>
              <button type="button" onClick={() => setShowNewCategory(false)} className="text-gray-500 px-2 text-sm">
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>

        {/* Time — only shown when editing, not when creating */}
        {place && (
          <TimeSection
            form={form}
            handleChange={handleChange}
            assignmentId={assignmentId}
            dayAssignments={dayAssignments}
            hasTimeError={hasTimeError}
            t={t}
          />
        )}

        {/* Price + Currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formPrice')}</label>
            <input
              type="number"
              min="0"
              step="any"
              value={form.price}
              onChange={e => handleChange('price', e.target.value)}
              placeholder="0.00"
              className="form-input"
            />
            {form.price && (
              <div className="flex mt-1.5 rounded-lg overflow-hidden border border-slate-200 text-xs">
                {([
                  ['total', t('places.formPriceTypeTotal')],
                  ['per_person', t('places.formPriceTypePerPerson')],
                  ['per_day', t('places.formPriceTypePerDay')],
                ] as [string, string][]).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleChange('price_type', type)}
                    className={`flex-1 py-1 px-1 text-center transition-colors ${
                      form.price_type === type
                        ? 'bg-slate-900 text-white font-medium'
                        : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formCurrency')}</label>
            <CustomSelect
              value={form.currency}
              onChange={value => handleChange('currency', value)}
              options={CURRENCIES.map(c => ({ value: c, label: c }))}
              size="sm"
            />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formWebsite')}</label>
          <input
            type="url"
            value={form.website}
            onChange={e => handleChange('website', e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.formPhone')}</label>
          <input
            type="tel"
            value={form.phone || ''}
            onChange={e => handleChange('phone', e.target.value)}
            placeholder={t('places.formPhonePlaceholder')}
            className="form-input"
          />
        </div>

        {/* Photo */}
        {place && (
          <div className="border border-gray-200 rounded-xl p-3 space-y-3">
            <label className="block text-sm font-medium text-gray-700">{t('places.formPhoto')}</label>

            {/* Current photo preview */}
            {place.image_url ? (
              <div className="relative rounded-lg overflow-hidden" style={{ maxHeight: 160 }}>
                <img
                  src={place.image_url}
                  alt={place.name}
                  className="w-full h-full object-cover"
                  style={{ maxHeight: 160 }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t('places.photoHint')}</p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Camera size={13} />
                {place.image_url ? t('places.changePhoto') : t('places.addPhoto')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUnsplashQuery(place.name || '')
                  setIsUnsplashModalOpen(true)
                  handleSearchUnsplash(place.name || '')
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Search size={13} />
                {t('places.searchUnsplash')}
              </button>
              {place.image_url && (
                <button
                  type="button"
                  onClick={handlePhotoDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  {t('places.deletePhoto')}
                </button>
              )}
            </div>

            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePhotoAdd}
            />

            {/* Unsplash picker */}
            {isUnsplashModalOpen && (
              <div className="mt-3 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{t('places.searchUnsplash')}</span>
                  <button
                    type="button"
                    onClick={() => { setIsUnsplashModalOpen(false); setUnsplashPhotos([]) }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={unsplashQuery}
                    onChange={e => setUnsplashQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchUnsplash() } }}
                    placeholder={t('places.unsplashSearchPlaceholder')}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleSearchUnsplash()}
                    className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-slate-700"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
                {unsplashPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {unsplashPhotos.map((photo: any) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => handleSelectUnsplashImage(photo.url)}
                        className="relative group rounded-lg overflow-hidden aspect-[4/3] bg-slate-200"
                        title={photo.description || ''}
                      >
                        <img
                          src={photo.thumb || photo.url}
                          alt={photo.description || ''}
                          className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="bg-slate-900 text-white text-xs px-2 py-1 rounded-md font-medium">
                            {t('places.selectPhoto')}
                          </span>
                        </div>
                        {photo.photographer && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                            <span className="text-[9px] text-white/90">{photo.photographer}</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t('places.noPhotosFound')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* File Attachments */}
        {canUploadFiles && (
          <div className="border border-gray-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">{t('files.title')}</label>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors">
                <Paperclip size={12} /> {t('files.attach')}
              </button>
            </div>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileAdd} />
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 text-xs">
                    <Paperclip size={10} className="text-slate-400 shrink-0" />
                    <span className="truncate flex-1 text-slate-600">{file.name}</span>
                    <button type="button" onClick={() => handleRemoveFile(idx)} className="text-slate-400 hover:text-red-500 shrink-0">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingFiles.length === 0 && (
              <p className="text-xs text-slate-400">{t('files.pasteHint')}</p>
            )}
          </div>
        )}

      </form>
    </Modal>
  )
}

interface TimeSectionProps {
  form: PlaceFormData
  handleChange: (field: string, value: string) => void
  assignmentId: number | null
  dayAssignments: Assignment[]
  hasTimeError: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}

function TimeSection({ form, handleChange, assignmentId, dayAssignments, hasTimeError, t }: TimeSectionProps) {

  const collisions = useMemo(() => {
    if (!assignmentId || !form.place_time || form.place_time.length < 5) return []
    // Find the day_id for the current assignment
    const current = dayAssignments.find(a => a.id === assignmentId)
    if (!current) return []
    const myStart = form.place_time
    const myEnd = form.end_time && form.end_time.length >= 5 ? form.end_time : null
    return dayAssignments.filter(a => {
      if (a.id === assignmentId) return false
      if (a.day_id !== current.day_id) return false
      const aStart = a.place?.place_time
      const aEnd = a.place?.end_time
      if (!aStart) return false
      // Check overlap: two intervals overlap if start < otherEnd AND otherStart < end
      const s1 = myStart, e1 = myEnd || myStart
      const s2 = aStart, e2 = aEnd || aStart
      return s1 < (e2 || '23:59') && s2 < (e1 || '23:59') && s1 !== e2 && s2 !== e1
    })
  }, [assignmentId, dayAssignments, form.place_time, form.end_time])

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.startTime')}</label>
          <CustomTimePicker
            value={form.place_time}
            onChange={v => handleChange('place_time', v)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('places.endTime')}</label>
          <CustomTimePicker
            value={form.end_time}
            onChange={v => handleChange('end_time', v)}
          />
        </div>
      </div>
      {hasTimeError && (
        <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-warning, #fef3c7)', color: 'var(--text-warning, #92400e)' }}>
          <AlertTriangle size={13} className="shrink-0" />
          {t('places.endTimeBeforeStart')}
        </div>
      )}
      {collisions.length > 0 && (
        <div className="flex items-start gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: 'var(--bg-warning, #fef3c7)', color: 'var(--text-warning, #92400e)' }}>
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            {t('places.timeCollision')}{' '}
            {collisions.map(a => a.place?.name).filter(Boolean).join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}
