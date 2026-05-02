import React from 'react'
import ReactDOM from 'react-dom/client'

function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>ComplianceDesk — Back-Office</h1>
      <p>VASP Operations SKU. Stub from Phase 0.</p>
      <p>Real implementation — Phase 4 (Operations + Custody).</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
