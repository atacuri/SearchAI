import { useEffect, useState } from "react"
import { PromptInput } from "./components/PromptInput"
import { AIConfigPanel } from "./components/AIConfig"
import type { PageTitles } from "./types"
import { getActiveTab, isSpecialPage, executeScriptInTab } from "./services/tabService"

function IndexPopup() {
  const [titles, setTitles] = useState<PageTitles | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)

  useEffect(() => {
    loadTitles()
  }, [])

  const loadTitles = async () => {
    try {
      setLoading(true)
      setError(null)

      const tab = await getActiveTab()

      if (!tab?.id) {
        setError('No se pudo obtener la pestaña activa.')
        return
      }

      if (isSpecialPage(tab.url)) {
        setError('Esta extensión no funciona en páginas especiales del navegador.')
        return
      }

      const pageTitles = await executeScriptInTab(tab.id, () => {
        return {
          pageTitle: document.title,
          h1Titles: Array.from(document.querySelectorAll('h1')).map(h => ({
            text: h.textContent?.trim() || '',
            html: h.innerHTML
          })),
          h2Titles: Array.from(document.querySelectorAll('h2')).map(h => ({
            text: h.textContent?.trim() || '',
            html: h.innerHTML
          })),
          h3Titles: Array.from(document.querySelectorAll('h3')).map(h => ({
            text: h.textContent?.trim() || '',
            html: h.innerHTML
          })),
          url: window.location.href
        }
      })

      setTitles(pageTitles)
    } catch (err: any) {
      setError(err.message || 'Error al cargar los títulos')
    } finally {
      setLoading(false)
    }
  }

  const handleCommandExecuted = (result: any) => {
    setCommandError(null)

    if (result?.action === 'changeColor' && result?.success) {
      // Color cambiado exitosamente
    }

    if (result?.action === 'getTitles') {
      setTitles(result)
    }
  }

  return (
    <div
      style={{
        padding: 16,
        minWidth: 400,
        maxHeight: 600,
        overflowY: 'auto'
      }}>
      <h2 style={{ marginTop: 0 }}>Títulos de la Página</h2>

      <AIConfigPanel />

      <PromptInput
        onCommandExecuted={handleCommandExecuted}
        onError={setCommandError}
      />

      {commandError && (
        <div style={{ color: 'red', marginBottom: 16, fontSize: '12px', padding: '8px', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>
          {commandError}
        </div>
      )}

      {loading && <p>Cargando...</p>}

      {error && (
        <div style={{ color: 'red', marginBottom: 16, fontSize: '13px' }}>
          {error}
        </div>
      )}

      {titles && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <strong>URL:</strong>
            <div style={{ fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>
              {titles.url}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Título de la página:</strong>
            <div style={{ fontSize: '14px', marginTop: 4 }}>
              {titles.pageTitle}
            </div>
          </div>

          {titles.h1Titles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>H1 ({titles.h1Titles.length}):</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                {titles.h1Titles.map((h1, index) => (
                  <li key={index} style={{ marginBottom: 4, fontSize: '13px' }}>
                    {h1.text || '(vacío)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {titles.h2Titles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>H2 ({titles.h2Titles.length}):</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                {titles.h2Titles.map((h2, index) => (
                  <li key={index} style={{ marginBottom: 4, fontSize: '13px' }}>
                    {h2.text || '(vacío)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {titles.h3Titles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>H3 ({titles.h3Titles.length}):</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                {titles.h3Titles.map((h3, index) => (
                  <li key={index} style={{ marginBottom: 4, fontSize: '13px' }}>
                    {h3.text || '(vacío)'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {titles.h1Titles.length === 0 &&
            titles.h2Titles.length === 0 &&
            titles.h3Titles.length === 0 && (
              <p style={{ color: '#666', fontSize: '13px' }}>
                No se encontraron títulos H1, H2 o H3 en esta página.
              </p>
            )}
        </div>
      )}
    </div>
  )
}

export default IndexPopup
