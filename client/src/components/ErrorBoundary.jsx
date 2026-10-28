import { Component } from 'react';

/** Catches render errors so one broken view does not blank the whole app. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('HotelPro UI error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="container py-5" role="alert">
        <div className="panel panel-pad mx-auto text-center" style={{ maxWidth: 560 }}>
          <h1 className="h2 mb-3">This page hit a problem</h1>
          <p className="text-muted">Something in the interface failed to display. Your bookings and data are safe on the server.</p>
          <div className="d-flex justify-content-center gap-2 mt-4">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <a className="btn btn-quiet" href="/">
              Go to homepage
            </a>
          </div>
        </div>
      </main>
    );
  }
}
