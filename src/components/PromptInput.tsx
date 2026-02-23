// src/components/PromptInput.tsx

import { useState, useEffect } from 'react'
import type { DSLCommand } from '../types'
import { parseWithAI, isAIConfigured } from '../dsl/aiParser'
import { executeCommand } from '../dsl/executor'

interface PromptInputProps {
  onCommandExecuted?: (result: any) => void
  onError?: (error: string) => void
}

export function PromptInput({ onCommandExecuted, onError }: PromptInputProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiReady, setAiReady] = useState(false)

  useEffect(() => {
    checkAI()
  }, [])

  const checkAI = async () => {
    const configured = await isAIConfigured()
    setAiReady(configured)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!input.trim()) return

    if (!aiReady) {
      onError?.('Configura tu API key de IA primero')
      return
    }

    setLoading(true)
    
    try {
      // Solo IA
      const command = await parseWithAI(input)
      
      if (!command || !command.action) {
        onError?.('La IA no pudo entender el comando. Intenta reformularlo.')
        setLoading(false)
        return
      }

      const result = await executeCommand(command)
      onCommandExecuted?.(result)
      setInput('')
    } catch (error: any) {
      onError?.(error.message || 'Error al ejecutar el comando')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: '13px', fontWeight: 'bold' }}>
          🤖 Escribe un comando en lenguaje natural:
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={aiReady ? 'Escribe lo que quieras hacer...' : 'Configura IA primero...'}
          disabled={loading || !aiReady}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '13px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxSizing: 'border-box'
          }}
        />
      </div>
      <button
        type="submit"
        disabled={loading || !input.trim() || !aiReady}
        style={{
          padding: '8px 16px',
          fontSize: '13px',
          backgroundColor: '#0066ff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading || !input.trim() || !aiReady ? 0.6 : 1
        }}
      >
        {loading ? '🤖 Procesando...' : 'Ejecutar'}
      </button>
      <div style={{ marginTop: 8, fontSize: '11px', color: '#666' }}>
        🤖 Todo pasa por IA — escribe naturalmente lo que necesites
        {!aiReady && (
          <div style={{ marginTop: 4, fontSize: '10px', color: '#ff6600' }}>
            ⚠️ Configura una API key de IA para poder usar el prompt
          </div>
        )}
      </div>
    </form>
  )
}
