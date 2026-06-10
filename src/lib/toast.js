// Plain helper — dispatch a toast from anywhere. The visual host lives in
// components/ToastHost.jsx (JSX must not live in a .js file for Vite).
export function toast(message) {
  window.dispatchEvent(new CustomEvent('sgas-toast', { detail: message }))
}
