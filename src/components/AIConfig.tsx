// src/components/AIConfig.tsx

import { useState, useEffect } from 'react'
import { getAIConfig, saveAIConfig, clearAIConfig, type AIConfig } from '../services/aiService'

interface AIConfigPanelProps {
  onConfigChanged?: () => void
}

export function AIConfigPanel({ onConfigChanged }: AIConfigPanelProps) {
  const [provider, setProvider] = useState<AIConfig['provider']>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saved, setSaved] = useState(false)
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    const config = await getAIConfig()
    if (config) {
      setProvider(config.provider)
      setApiKey(config.apiKey)
      setModel(config.model || '')
      setConfigured(true)
    }
  }

  const handleSave = async () => {
    if (!apiKey.trim()) {
      alert('Por favor ingresa una API key')
      return
    }

    const config: AIConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined
    }

    await saveAIConfig(config)
    setConfigured(true)
    setSaved(true)
    onConfigChanged?.()
    setTimeout(() => setSaved(false), 1500)
  }

  const handleClear = async () => {
    await clearAIConfig()
    setApiKey('')
    setModel('')
    setConfigured(false)
    onConfigChanged?.()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const getDefaultModel = () => {
    switch (provider) {
      case 'groq':
        return 'llama-3.1-8b-instant'
      case 'openai':
        return 'gpt-4o-mini'
      case 'anthropic':
        return 'claude-3-haiku-20240307'
      case 'google':
        return 'gemini-2.0-flash'
    }
  }

  return (
    <div style={{
      padding: '12px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
      marginBottom: 12,
      border: '1px solid #ddd'
    }}>
      <strong style={{ fontSize: '13px', display: 'block', marginBottom: 10 }}>
        ⚙️ Configuración de IA {configured && '✅'}
      </strong>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 'bold' }}>
          Proveedor:
        </label>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as AIConfig['provider'])
            setModel('')
          }}
          style={{
            width: '100%',
            padding: '6px',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        >
          <option value="groq">⚡ Groq (Gratis - Recomendado)</option>
          <option value="openai">OpenAI (GPT)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="google">Google (Gemini)</option>
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 'bold' }}>
          API Key:
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={`API key de ${provider}`}
          style={{
            width: '100%',
            padding: '6px',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ fontSize: '10px', color: '#666', marginTop: 4 }}>
          {provider === 'groq' && '→ https://console.groq.com/keys (gratis)'}
          {provider === 'openai' && '→ https://platform.openai.com/api-keys'}
          {provider === 'anthropic' && '→ https://console.anthropic.com/'}
          {provider === 'google' && '→ https://makersuite.google.com/app/apikey'}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 'bold' }}>
          Modelo (opcional):
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={getDefaultModel()}
          style={{
            width: '100%',
            padding: '6px',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxSizing: 'border-box'
          }}
        />
        <div style={{ fontSize: '10px', color: '#666', marginTop: 4 }}>
          Deja vacío para usar: {getDefaultModel()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '12px',
            backgroundColor: '#0066ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {saved ? '✅ Guardado' : 'Guardar'}
        </button>
        {configured && (
          <button
            onClick={handleClear}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              backgroundColor: '#ff4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </div>
  )
}
