// Plain helper — dispatch a toast from anywhere. The visual host lives in
// components/ToastHost.jsx (JSX must not live in a .js file for Vite).
//
//   toast('Saved')                              — a message
//   toast('Marked sent', { undo: () => … })     — a message with an Undo button
//
// The undo function is run if the person presses Undo while the toast shows.
// It is the caller's job to make it actually reverse the thing (and reload).
export function toast(message, opts = null) {
  const detail = opts && typeof opts.undo === 'function' ? { message, undo: opts.undo } : message
  window.dispatchEvent(new CustomEvent('sgas-toast', { detail }))
}
