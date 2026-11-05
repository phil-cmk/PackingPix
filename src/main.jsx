import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
class ErrorBoundary extends React.Component {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (this.state.failed) return <main className="fatal"><h1>Let’s reopen your workspace.</h1><p>The interface encountered an error. Your saved database is still in IndexedDB.</p><button onClick={() => location.reload()}>Reload app</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);