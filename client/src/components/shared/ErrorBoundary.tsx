import React, { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--bg-secondary, #f3f4f6)',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              textAlign: 'center',
              background: 'var(--bg-card, white)',
              borderRadius: 16,
              padding: '40px 32px',
              border: '1px solid var(--border-faint, #e5e7eb)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'rgba(239,68,68,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <AlertTriangle size={24} style={{ color: '#dc2626' }} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: '0 0 8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', lineHeight: 1.6, margin: '0 0 24px' }}>
              An unexpected error occurred. Try refreshing the page to continue.
            </p>
            <button
              onClick={this.handleRetry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent, #111827)',
                color: 'var(--accent-text, white)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={14} />
              Refresh page
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre
                style={{
                  marginTop: 20,
                  padding: 12,
                  borderRadius: 8,
                  background: '#f3f4f6',
                  fontSize: 11,
                  color: '#374151',
                  textAlign: 'left',
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
