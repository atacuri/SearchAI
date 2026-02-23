// src/dsl/aiParser.ts
// Intermediario entre la UI y el servicio de IA

import type { DSLCommand } from '../types'
import { parseCommandWithAI, getAIConfig } from '../services/aiService'

export async function parseWithAI(input: string): Promise<DSLCommand | null> {
  const config = await getAIConfig()
  
  if (!config || !config.apiKey) {
    throw new Error('No hay API key configurada. Configura tu proveedor de IA primero.')
  }

  // Ahora delega al background script vía chrome.runtime.sendMessage
  return await parseCommandWithAI(input, config)
}

export async function isAIConfigured(): Promise<boolean> {
  const config = await getAIConfig()
  return config !== null && config.apiKey !== '' && config.apiKey !== undefined
}
