/**
 * Extracts a YouTube embed URL from text.
 * Supports both youtube.com/embed/ID and youtube.com/watch?v=ID formats.
 * Returns null if no valid YouTube URL is found.
 */
export function extractYouTubeEmbedUrl(text: string | null | undefined): string | null {
  if (!text) return null

  // Match youtube.com/embed/VIDEO_ID
  const embedMatch = text.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch) {
    return `https://www.youtube.com/embed/${embedMatch[1]}`
  }

  // Match youtube.com/watch?v=VIDEO_ID
  const watchMatch = text.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch) {
    return `https://www.youtube.com/embed/${watchMatch[1]}`
  }

  // Match youtu.be/VIDEO_ID
  const shortMatch = text.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`
  }

  return null
}
