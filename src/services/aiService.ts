// src/services/aiService.ts
// Maneja configuración de IA y delega las llamadas API al background script

import type { DSLCommand } from '../types'

export interface AIConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'google'
  apiKey: string
  model?: string
}

const STORAGE_KEY = 'ai_config'

// ============ Storage con chrome.storage.local ============

export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const stored = result[STORAGE_KEY]
    if (!stored) return null
    return stored as AIConfig
  } catch {
    return null
  }
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: config })
}

export async function clearAIConfig(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY)
}

// ============ Parseo de comandos vía Background Script ============

export async function parseCommandWithAI(
  input: string,
  config: AIConfig
): Promise<DSLCommand | null> {
  // Enviar mensaje al background service worker que tiene acceso cross-origin
  const response = await chrome.runtime.sendMessage({
    type: 'AI_PARSE_COMMAND',
    input,
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model
  })

  if (!response) {
    throw new Error('No se recibió respuesta del background script')
  }

  if (!response.success) {
    throw new Error(response.error || 'Error desconocido al comunicarse con la IA')
  }

  return response.command as DSLCommand | null
}
