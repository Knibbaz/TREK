import React, { useState } from 'react'
import { Play, X } from 'lucide-react'

interface VideoEmbedProps {
  embedUrl: string
  title?: string
}

export default function VideoEmbed({ embedUrl, title = 'Video' }: VideoEmbedProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  if (!embedUrl) return null

  return (
    <div style={{ marginTop: 8 }}>
      {!isPlaying ? (
        <button
          onClick={() => setIsPlaying(true)}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border-faint)',
            background: 'var(--bg-hover)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {/* Thumbnail via YouTube image CDN */}
          <img
            src={`https://img.youtube.com/vi/${extractVideoId(embedUrl)}/mqdefault.jpg`}
            alt={title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.85,
            }}
          />
          {/* Play overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.25)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.25)'
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <Play size={24} fill="#dc2626" color="#dc2626" style={{ marginLeft: 3 }} />
            </div>
          </div>
        </button>
      ) : (
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 10,
            overflow: 'hidden',
            border: '1px solid var(--border-faint)',
            background: '#000',
          }}
        >
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
          <button
            onClick={() => setIsPlaying(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
            }}
          >
            <X size={14} color="#fff" />
          </button>
        </div>
      )}
    </div>
  )
}

function extractVideoId(embedUrl: string): string | null {
  const match = embedUrl.match(/embed\/([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}
