import React from 'react'
import ReactDOM from 'react-dom/client'
import { I18nProvider } from './i18n/I18nContext'
import App from './App'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<h1 style="color:red">#root not found!</h1>'
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <I18nProvider>
          <App />
        </I18nProvider>
      </React.StrictMode>
    )
  } catch (err: any) {
    rootEl.innerHTML = `<h1 style="color:red">React Crash: ${err.message}</h1><pre>${err.stack}</pre>`
  }
}
