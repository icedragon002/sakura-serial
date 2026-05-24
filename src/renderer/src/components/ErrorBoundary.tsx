import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="protocol-panel">
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              {this.props.fallbackLabel || 'Panel crashed'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              className="pp-btn"
              onClick={() => this.setState({ hasError: false, error: undefined })}
              style={{ marginTop: 12 }}
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
