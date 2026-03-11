// src/content.tsx  
// Plasmo Content Script UI - Icono flotante con prompt (solo IA)

import { useState, useRef, useEffect } from "react"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import type { DSLCommand, ScrapeResult, ScrapedItem, CreateStructureResult, ListStructuresResult, SiteStructure, PropertySchema } from "./types"
import { parseWithAI, isAIConfigured } from "./dsl/aiParser"
import { executePageCommand } from "./dsl/pageExecutor"
import { getAIConfig, saveAIConfig, clearAIConfig, type AIConfig } from "./services/aiService"

const BUILD_TAG = "springer-fix-4"

// Configuración del content script
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

// Estilos en Shadow DOM para no afectar la página
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .floating-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .floating-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0066ff, #0044cc);
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 12px rgba(0, 102, 255, 0.4);
      transition: all 0.3s ease;
      position: relative;
    }

    .floating-icon::after {
      content: attr(data-build);
      position: absolute;
      right: -8px;
      bottom: -8px;
      font-size: 8px;
      font-weight: 700;
      line-height: 1;
      padding: 3px 5px;
      border-radius: 999px;
      color: #0b3b91;
      background: #ffffff;
      border: 1px solid #d6e4ff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      max-width: 72px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }

    .floating-icon:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0, 102, 255, 0.5);
    }

    .floating-icon.active {
      background: linear-gradient(135deg, #ff4444, #cc0000);
      box-shadow: 0 4px 12px rgba(255, 68, 68, 0.4);
    }

    .prompt-panel {
      position: fixed;
      bottom: 90px;
      right: 24px;
      width: 400px;
      max-height: 540px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      animation: slideUp 0.3s ease;
      display: flex;
      flex-direction: column;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .panel-header {
      padding: 14px 16px;
      background: linear-gradient(135deg, #0066ff, #0044cc);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .panel-header h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      color: white;
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .build-tag {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2px;
      padding: 2px 6px;
      border-radius: 999px;
      color: #0b3b91;
      background: rgba(255, 255, 255, 0.9);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .gear-btn {
      background: none;
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
      padding: 0;
    }

    .gear-btn:hover {
      opacity: 1;
    }

    .close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
      padding: 0;
      line-height: 1;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .panel-body {
      padding: 16px;
      overflow-y: auto;
      max-height: 440px;
      flex: 1;
    }

    .ai-config {
      padding: 12px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      margin-bottom: 12px;
      animation: slideUp 0.2s ease;
    }

    .ai-config-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #333;
    }

    .ai-field {
      margin-bottom: 8px;
    }

    .ai-field label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #555;
      margin-bottom: 3px;
    }

    .ai-field select,
    .ai-field input {
      width: 100%;
      padding: 7px 10px;
      font-size: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .ai-field select:focus,
    .ai-field input:focus {
      border-color: #0066ff;
    }

    .ai-field .hint {
      font-size: 10px;
      color: #888;
      margin-top: 2px;
    }

    .ai-buttons {
      display: flex;
      gap: 6px;
      margin-top: 10px;
    }

    .ai-save-btn {
      flex: 1;
      padding: 7px;
      font-size: 12px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }

    .ai-save-btn:hover {
      background: #0044cc;
    }

    .ai-clear-btn {
      padding: 7px 12px;
      font-size: 12px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }

    .ai-clear-btn:hover {
      background: #cc0000;
    }

    .no-ai-warning {
      padding: 14px;
      background: #fff8e1;
      border: 1px solid #ffc107;
      border-radius: 10px;
      text-align: center;
      margin-bottom: 12px;
    }

    .no-ai-warning p {
      font-size: 12px;
      color: #795548;
      margin: 0 0 8px 0;
    }

    .no-ai-warning button {
      padding: 6px 16px;
      font-size: 12px;
      background: #ff9800;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
    }

    .prompt-form {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .prompt-input {
      flex: 1;
      padding: 10px 12px;
      font-size: 13px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      outline: none;
      transition: border-color 0.2s;
      font-family: inherit;
    }

    .prompt-input:focus {
      border-color: #0066ff;
    }

    .prompt-input:disabled {
      background: #f5f5f5;
      cursor: not-allowed;
    }

    .send-btn {
      padding: 10px 16px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
      white-space: nowrap;
      font-family: inherit;
    }

    .send-btn:hover:not(:disabled) {
      background: #0044cc;
    }

    .send-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .quick-btn {
      padding: 5px 10px;
      font-size: 11px;
      border: 1px solid #e0e0e0;
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
      color: #333;
      font-family: inherit;
    }

    .quick-btn:hover {
      border-color: #0066ff;
      color: #0066ff;
      background: #f0f6ff;
    }

    .color-btn {
      color: white;
      border: 2px solid transparent;
    }

    .color-btn:hover {
      opacity: 0.85;
      color: white;
      border-color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .result-area {
      margin-top: 12px;
      font-size: 12px;
    }

    .result-success {
      padding: 10px 12px;
      background: #f0fff0;
      border: 1px solid #00aa00;
      border-radius: 8px;
      color: #006600;
    }

    .result-error {
      padding: 10px 12px;
      background: #fff0f0;
      border: 1px solid #ff4444;
      border-radius: 8px;
      color: #cc0000;
    }

    .result-titles {
      padding: 10px 12px;
      background: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 8px;
    }

    .result-titles h4 {
      font-size: 13px;
      margin: 0 0 6px 0;
      color: #333;
    }

    .result-titles ul {
      padding-left: 16px;
      margin: 4px 0;
    }

    .result-titles li {
      font-size: 12px;
      margin-bottom: 3px;
      color: #555;
    }

    .hint-text {
      font-size: 11px;
      color: #999;
      margin-top: 8px;
    }

    /* ===== Estilos para resultados de scraping ===== */
    .result-scrape {
      padding: 10px 12px;
      background: #f0f4ff;
      border: 1px solid #0066ff;
      border-radius: 8px;
    }

    .scrape-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .scrape-header h4 {
      font-size: 13px;
      margin: 0;
      color: #0044cc;
    }

    .scrape-meta {
      font-size: 10px;
      color: #666;
      margin-bottom: 8px;
      padding: 4px 8px;
      background: #e8ecf4;
      border-radius: 4px;
    }

    .scrape-articles {
      max-height: 250px;
      overflow-y: auto;
    }

    .scrape-article {
      padding: 8px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .scrape-article-title {
      font-weight: 600;
      font-size: 12px;
      color: #1a0dab;
      margin-bottom: 4px;
      cursor: pointer;
      text-decoration: none;
      display: block;
    }

    .scrape-article-title:hover {
      text-decoration: underline;
    }

    .scrape-article-authors {
      font-size: 10px;
      color: #006621;
      margin-bottom: 2px;
    }

    .scrape-article-meta {
      font-size: 10px;
      color: #888;
      margin-bottom: 4px;
    }

    .scrape-article-abstract {
      font-size: 11px;
      color: #555;
      line-height: 1.4;
    }

    .json-toggle-btn {
      padding: 4px 10px;
      font-size: 10px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    }

    .json-toggle-btn:hover {
      background: #0044cc;
    }

    .json-view {
      margin-top: 8px;
      padding: 8px;
      background: #1e1e1e;
      border-radius: 6px;
      max-height: 300px;
      overflow: auto;
    }

    .json-view pre {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 10px;
      color: #d4d4d4;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }

    .copy-json-btn {
      margin-top: 6px;
      padding: 4px 10px;
      font-size: 10px;
      background: #28a745;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    }

    .copy-json-btn:hover {
      background: #218838;
    }

    .scrape-btn {
      background: linear-gradient(135deg, #6c5ce7, #a29bfe) !important;
      color: white !important;
      border: none !important;
    }

    .scrape-btn:hover {
      opacity: 0.9;
    }

    .structure-btn {
      background: linear-gradient(135deg, #00b894, #55efc4) !important;
      color: white !important;
      border: none !important;
    }

    .structure-btn:hover {
      opacity: 0.9;
    }

    /* ===== Resultado de createStructure ===== */
    .result-structure {
      padding: 10px 12px;
      background: #f0fff4;
      border: 1px solid #00b894;
      border-radius: 8px;
    }

    .structure-header h4 {
      font-size: 13px;
      margin: 0 0 8px 0;
      color: #00695c;
    }

    .structure-details {
      font-size: 11px;
      color: #555;
    }

    .structure-details .detail-row {
      display: flex;
      margin-bottom: 4px;
    }

    .structure-details .detail-label {
      font-weight: 600;
      min-width: 100px;
      color: #333;
    }

    .structure-details .detail-value {
      color: #666;
      word-break: break-all;
    }

    .selectors-grid {
      margin-top: 8px;
      padding: 8px;
      background: #e8f5e9;
      border-radius: 6px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 10px;
    }

    .selector-row {
      display: flex;
      margin-bottom: 3px;
    }

    .selector-name {
      min-width: 110px;
      color: #2e7d32;
      font-weight: 600;
    }

    .selector-value {
      color: #1b5e20;
    }

    .structure-message {
      margin-top: 8px;
      padding: 8px;
      background: #c8e6c9;
      border-radius: 4px;
      font-size: 11px;
      color: #1b5e20;
    }

    /* ===== Lista de estructuras ===== */
    .list-btn {
      background: linear-gradient(135deg, #fdcb6e, #f39c12) !important;
      color: white !important;
      border: none !important;
    }

    .list-btn:hover {
      opacity: 0.9;
    }

    .result-list-structures {
      padding: 10px 12px;
      background: #fffde7;
      border: 1px solid #f9a825;
      border-radius: 8px;
    }

    .list-structures-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .list-structures-header h4 {
      font-size: 13px;
      margin: 0;
      color: #f57f17;
    }

    .structure-card {
      padding: 10px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      transition: border-color 0.2s;
    }

    .structure-card:hover {
      border-color: #f9a825;
    }

    .structure-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .structure-card-name {
      font-weight: 700;
      font-size: 13px;
      color: #333;
    }

    .structure-card-badge {
      padding: 2px 8px;
      background: #e3f2fd;
      color: #1565c0;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
    }

    .structure-card-info {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 8px;
      font-size: 10px;
      color: #666;
    }

    .structure-card-info .info-label {
      font-weight: 600;
      color: #555;
    }

    .structure-card-info .info-value {
      color: #777;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .structure-card-selectors {
      margin-top: 6px;
      padding: 6px;
      background: #f5f5f5;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 9px;
      color: #555;
      display: none;
    }

    .structure-card:hover .structure-card-selectors {
      display: block;
    }

    .structure-card-selectors .sel-row {
      display: flex;
      gap: 4px;
      margin-bottom: 1px;
    }

    .structure-card-selectors .sel-name {
      color: #2e7d32;
      font-weight: 600;
      min-width: 95px;
    }

    .structure-card-selectors .sel-value {
      color: #1b5e20;
    }

    .delete-structure-btn {
      padding: 2px 8px;
      font-size: 9px;
      background: #ffcdd2;
      color: #c62828;
      border: 1px solid #ef9a9a;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }

    .delete-structure-btn:hover {
      background: #ef5350;
      color: white;
      border-color: #ef5350;
    }

    .no-structures {
      padding: 12px;
      text-align: center;
      color: #999;
      font-size: 12px;
    }

  `
  return style
}

// Interfaces de títulos ocultas temporalmente
// interface TitleItem { text: string; html: string }
// interface TitlesResult { ... }

function FloatingPrompt() {
  const [isOpen, setIsOpen] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiReady, setAiReady] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // AI Config state
  const [provider, setProvider] = useState<AIConfig['provider']>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    if (isOpen) {
      checkAIStatus()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && !showConfig && aiReady && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, showConfig, aiReady])

  const checkAIStatus = async () => {
    const configured = await isAIConfigured()
    setAiReady(configured)

    const config = await getAIConfig()
    if (config) {
      setProvider(config.provider)
      setApiKey(config.apiKey)
      setModel(config.model || '')
    }

    if (!configured) {
      setShowConfig(true)
    }
  }

  const handleSaveConfig = async () => {
    if (!apiKey.trim()) return

    const config: AIConfig = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined
    }

    await saveAIConfig(config)
    setAiReady(true)
    setConfigSaved(true)
    setTimeout(() => {
      setConfigSaved(false)
      setShowConfig(false)
    }, 1000)
  }

  const handleClearConfig = async () => {
    await clearAIConfig()
    setApiKey('')
    setModel('')
    setAiReady(false)
    setShowConfig(true)
  }

  const getDefaultModel = () => {
    switch (provider) {
      case 'groq': return 'llama-3.1-8b-instant'
      case 'openai': return 'gpt-4o-mini'
      case 'anthropic': return 'claude-3-haiku-20240307'
      case 'google': return 'gemini-2.0-flash'
    }
  }

  const hasInvisibleIntent = (text: string): boolean => {
    const lower = text.toLowerCase().trim()
    return (
      lower.includes('invisible') ||
      lower.includes('invisble') ||
      lower.includes('invislbe') ||
      lower.includes('invsible') ||
      lower.includes('segundo plano') ||
      lower.includes('sin abrir pestaña') ||
      lower.includes('sin abrir pestana') ||
      lower.includes('sin abrir tab')
    )
  }

  const sanitizeSearchQuery = (query: string): string => {
    return query
      .replace(/\ben\s+segundo\s+plano\b/gi, ' ')
      .replace(/\bsin\s+abrir\s+pestaña\b/gi, ' ')
      .replace(/\bsin\s+abrir\s+pestana\b/gi, ' ')
      .replace(/\bsin\s+abrir\s+tab\b/gi, ' ')
      .replace(/\b(invisible|invisble|invislbe|invsible|visible)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const normalizeSiteText = (site: string): string => {
    const lower = site.toLowerCase().trim()
    if (
      lower.includes('scholar') ||
      lower.includes('scgolar') ||
      lower.includes('escholar') ||
      lower.includes('google escholar')
    ) return 'Google Scholar'
    if (lower.includes('springer') || lower.includes('sprigner')) return 'Springer'
    if (lower.includes('dblp')) return 'DBLP'
    return site.trim()
  }

  const normalizeSelectionText = (selectionRaw: string): 'first result' | 'best result' | 'All' => {
    const s = selectionRaw.toLowerCase()
    if (s.includes('all') || s.includes('todo')) return 'All'
    if (s.includes('first') || s.includes('primer') || s.includes('primero')) return 'first result'
    return 'best result'
  }

  const extractChainSearchIntent = (rawInput: string): DSLCommand | null => {
    const text = rawInput.trim()
    const lower = text.toLowerCase()
    const chainSignal =
      lower.includes('por cada resultado') ||
      lower.includes('por cada item') ||
      lower.includes('por cada ítem')
    if (!chainSignal) return null

    // Ejemplo: "Busca en springer IOT y por cada resultado ... en google scholar ... best result"
    const sourceMatch = text.match(
      /(?:^|\s)busca(?:r)?\s+en\s+(google\s*scholar|google\s*escholar|scholar|springer|sprigner|dblp|amazon)\s+(.+?)\s+y\s+por\s+cada\s+resultado/i
    )
    if (!sourceMatch?.[1] || !sourceMatch?.[2]) return null

    const sourceSite = normalizeSiteText(sourceMatch[1])
    const sourceQuery = sanitizeSearchQuery(sourceMatch[2])
    if (!sourceSite || !sourceQuery) return null

    const targetSiteMatches = Array.from(
      text.matchAll(/(?:en|a)\s+(google\s*scholar|google\s*escholar|scholar|springer|sprigner|dblp|amazon)/gi)
    )
    // Tomar el último sitio mencionado (normalmente el destino, después de "por cada resultado")
    const lastTarget = targetSiteMatches[targetSiteMatches.length - 1]?.[1]
    const targetSite = normalizeSiteText(lastTarget || 'Google Scholar')

    const asksCitations =
      /\b(citas|citations?|cited\s*by)\b/i.test(text) ||
      /n[uú]mero\s+de\s+citas/i.test(text)
    const propertyMatch = lower.match(/numero\s+de\s+([a-záéíóúñ_ ]+)|n[uú]mero\s+de\s+([a-záéíóúñ_ ]+)|\b(citas|citations?)\b/i)
    const targetProperty = asksCitations
      ? 'citations'
      : (propertyMatch?.[1] || propertyMatch?.[2] || propertyMatch?.[3] || 'citations').trim()

    const sourceProperty = lower.includes('titulo') || lower.includes('title') ? 'title' : 'title'
    const selection = normalizeSelectionText(lower)

    return {
      action: 'chainSearch',
      params: {
        sourceSite,
        sourceQuery,
        sourceProperty,
        targetSite,
        targetProperty,
        selection,
        maxItems: 10
      }
    }
  }

  const normalizeSearchCommandParams = (cmd: DSLCommand): DSLCommand => {
    if (cmd.action !== 'searchSite' && cmd.action !== 'searchSiteVisible') return cmd
    const currentSite = String(cmd.params?.site || '').trim()
    const currentQuery = String(cmd.params?.query || '').trim()
    const cleanedQuery = sanitizeSearchQuery(currentQuery)
    return {
      ...cmd,
      params: {
        ...cmd.params,
        site: currentSite,
        query: cleanedQuery || currentQuery
      }
    }
  }

  const normalizeParsedCommand = (rawInput: string, parsed: DSLCommand | null): DSLCommand | null => {
    const chainIntent = extractChainSearchIntent(rawInput)
    if (chainIntent) return chainIntent

    const wantsInvisible = hasInvisibleIntent(rawInput)

    // Si la IA devolvió búsqueda de sitio, forzar modo visible/invisible según el texto
    if (parsed?.action === 'searchSite' && !wantsInvisible) {
      return normalizeSearchCommandParams({
        action: 'searchSiteVisible',
        params: parsed.params
      })
    }
    if (parsed?.action === 'searchSiteVisible' && wantsInvisible) {
      return normalizeSearchCommandParams({
        action: 'searchSite',
        params: parsed.params
      })
    }

    // Fallback regex para frases comunes, incluso si la IA falla
    const inSiteMatch = rawInput.match(/en\s+(.+?)\s+busca(?:r)?\s+(.+)/i)
    if (inSiteMatch) {
      const site = inSiteMatch[1]?.trim()
      const query = inSiteMatch[2]?.trim()
      if (site && query) {
        return {
          action: wantsInvisible ? 'searchSite' : 'searchSiteVisible',
          params: { site, query: sanitizeSearchQuery(query) || query }
        }
      }
    }

    const searchInMatch = rawInput.match(/busca(?:r)?\s+(.+?)\s+en\s+(.+)/i)
    if (searchInMatch) {
      const query = searchInMatch[1]?.trim()
      const site = searchInMatch[2]?.trim()
      if (site && query) {
        return {
          action: wantsInvisible ? 'searchSite' : 'searchSiteVisible',
          params: { site, query: sanitizeSearchQuery(query) || query }
        }
      }
    }

    return parsed ? normalizeSearchCommandParams(parsed) : parsed
  }

  const extractVisibleSearchIntent = (rawInput: string): { site: string; query: string } | null => {
    const text = rawInput.trim()
    if (extractChainSearchIntent(text)) return null
    const wantsInvisible = hasInvisibleIntent(text)

    if (wantsInvisible) return null

    const inSiteMatch = text.match(/en\s+(.+?)\s+busca(?:r)?\s+(.+)/i)
    if (inSiteMatch?.[1] && inSiteMatch?.[2]) {
      return { site: inSiteMatch[1].trim(), query: inSiteMatch[2].trim() }
    }

    const searchInMatch = text.match(/busca(?:r)?\s+(.+?)\s+en\s+(.+)/i)
    if (searchInMatch?.[1] && searchInMatch?.[2]) {
      return { site: searchInMatch[2].trim(), query: searchInMatch[1].trim() }
    }

    return null
  }

  const buildLocalSearchUrl = (siteName: string, query: string): string | null => {
    const site = siteName.toLowerCase()
    const encoded = encodeURIComponent(query)

    if (site.includes('scholar') || site.includes('scgolar') || site.includes('google scholar')) {
      return `https://scholar.google.com/scholar?q=${encoded}`
    }
    if (site.includes('springer')) {
      return `https://link.springer.com/search?query=${encoded}`
    }
    if (site.includes('dblp')) {
      return `https://dblp.org/search?q=${encoded}`
    }
    if (site.includes('amazon')) {
      return `https://www.amazon.com/s?k=${encoded}`
    }
    return null
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading) return
    const rawInput = input.trim()

    if (!aiReady) {
      setError('Configura tu API key de IA primero')
      setShowConfig(true)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    // Anti-popup-blocker: preabre una pestaña durante el gesto del usuario.
    const visibleIntent = extractVisibleSearchIntent(rawInput)
    let preOpenedTab: Window | null = null
    if (visibleIntent) {
      preOpenedTab = window.open('about:blank', '_blank')
    }

    try {
      const aiCommand = await parseWithAI(rawInput)
      const command = normalizeParsedCommand(rawInput, aiCommand)

      if (!command || !command.action) {
        if (preOpenedTab && !preOpenedTab.closed) preOpenedTab.close()
        setError('La IA no pudo interpretar el comando. Intenta reformularlo.')
        setLoading(false)
        return
      }

      const res = await executePageCommand(command)

      if (preOpenedTab && !preOpenedTab.closed) {
        if (command.action === 'searchSiteVisible' && res?.url) {
          preOpenedTab.location.href = res.url
        } else {
          preOpenedTab.close()
        }
      }

      setResult(res)
      setInput("")
    } catch (err: any) {
      if (preOpenedTab && !preOpenedTab.closed && visibleIntent) {
        const localUrl = buildLocalSearchUrl(visibleIntent.site, visibleIntent.query)
        if (localUrl) {
          preOpenedTab.location.href = localUrl
          setResult({
            action: 'searchSiteVisible',
            success: true,
            url: localUrl,
            message: `Se abrió una nueva pestaña con fallback local para "${visibleIntent.query}".`
          })
          setInput("")
          setLoading(false)
          return
        }
        preOpenedTab.close()
      }

      console.error('[FloatingPrompt] Error completo:', err)
      const msg = err.message || "Error desconocido"
      // Siempre mostrar el error completo para poder diagnosticar
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const executeQuickAction = async (command: DSLCommand) => {
    setError(null)
    setResult(null)

    try {
      const res = await executePageCommand(command)
      setResult(res)
    } catch (err: any) {
      setError(err.message || "Error al ejecutar")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit()
    }
    if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div className="floating-container">
      {isOpen && (
        <div className="prompt-panel">
          <div className="panel-header">
            <div className="panel-title">
              <h3>🤖 AI Scraper</h3>
              <span className="build-tag">{BUILD_TAG}</span>
            </div>
            <div className="header-actions">
              <button
                className="gear-btn"
                onClick={() => setShowConfig(!showConfig)}
                title="Configurar IA">
                ⚙️
              </button>
              <button className="close-btn" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
          </div>

          <div className="panel-body">
            {showConfig && (
              <div className="ai-config">
                <div className="ai-config-title">
                  ⚙️ Configuración de IA {aiReady && '✅'}
                </div>

                <div className="ai-field">
                  <label>Proveedor:</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value as AIConfig['provider'])
                      setModel('')
                    }}>
                    <option value="groq">⚡ Groq (Gratis - Recomendado)</option>
                    <option value="openai">OpenAI (GPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="google">Google (Gemini)</option>
                  </select>
                </div>

                <div className="ai-field">
                  <label>API Key:</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`API key de ${provider}`}
                  />
                  <div className="hint">
                    {provider === 'groq' && '→ console.groq.com/keys (gratis)'}
                    {provider === 'openai' && '→ platform.openai.com/api-keys'}
                    {provider === 'anthropic' && '→ console.anthropic.com'}
                    {provider === 'google' && '→ makersuite.google.com/app/apikey'}
                  </div>
                </div>

                <div className="ai-field">
                  <label>Modelo (opcional):</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={getDefaultModel()}
                  />
                  <div className="hint">Por defecto: {getDefaultModel()}</div>
                </div>

                <div className="ai-buttons">
                  <button className="ai-save-btn" onClick={handleSaveConfig}>
                    {configSaved ? '✅ Guardado!' : 'Guardar'}
                  </button>
                  {aiReady && (
                    <button className="ai-clear-btn" onClick={handleClearConfig}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            )}

            {!aiReady && !showConfig && (
              <div className="no-ai-warning">
                <p>⚠️ Necesitas configurar una API key de IA para usar el prompt</p>
                <button onClick={() => setShowConfig(true)}>Configurar ahora</button>
              </div>
            )}

            <form className="prompt-form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                className="prompt-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={aiReady ? 'Escribe lo que quieras hacer...' : 'Configura IA primero...'}
                disabled={loading || !aiReady}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={loading || !input.trim() || !aiReady}>
                {loading ? "🤖..." : "Enviar"}
              </button>
            </form>

            <div className="quick-actions">
              <button
                className="quick-btn scrape-btn"
                onClick={() =>
                  executeQuickAction({
                    action: "scrapeResults",
                    params: {}
                  })
                }>
                🔬 Extraer datos
              </button>
              <button
                className="quick-btn structure-btn"
                onClick={() =>
                  executeQuickAction({
                    action: "createStructure",
                    params: {}
                  })
                }>
                🧠 Crear estructura
              </button>
              <button
                className="quick-btn list-btn"
                onClick={() =>
                  executeQuickAction({
                    action: "listStructures",
                    params: {}
                  })
                }>
                📂 Ver sitios
              </button>
            </div>

            {loading && (
              <div className="result-area">
                <div className="result-success">
                  🤖 Procesando con IA...
                </div>
              </div>
            )}

            {error && (
              <div className="result-area">
                <div className="result-error">❌ {error}</div>
              </div>
            )}

            {/* Funcionalidad de títulos oculta temporalmente
            {result && result.action === "changeColor" && (...)}
            {result && result.action === "getTitles" && (...)}
            */}

            {result && result.action === "deleteStructure" && (
              <div className="result-area">
                <div className="result-success">
                  🗑️ {result.message}
                </div>
              </div>
            )}

            {result && result.action === "listStructures" && (
              <div className="result-area">
                <div className="result-list-structures">
                  <div className="list-structures-header">
                    <h4>📂 Sitios configurados ({(result as ListStructuresResult).total})</h4>
                  </div>

                  {(result as ListStructuresResult).structures.length === 0 ? (
                    <div className="no-structures">
                      No hay estructuras guardadas. Navega a un sitio de búsqueda y usa 🧠 "Crear estructura".
                    </div>
                  ) : (
                    (result as ListStructuresResult).structures.map((s: SiteStructure, i: number) => (
                      <div key={`struct-${i}`} className="structure-card">
                        <div className="structure-card-header">
                          <span className="structure-card-name">
                            {s.name}
                          </span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span className="structure-card-badge">
                              {s.object_semantic_structure_schema?.type || 'General'}
                            </span>
                            <button
                              className="delete-structure-btn"
                              onClick={() =>
                                executeQuickAction({
                                  action: "deleteStructure",
                                  params: { name: s.name }
                                })
                              }>
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="structure-card-info">
                          <span className="info-label">🌐 URL:</span>
                          <span className="info-value">{s.url}</span>

                          <span className="info-label">📂 Dominio:</span>
                          <span className="info-value">{s.domain}</span>

                          <span className="info-label">🔍 Búsqueda:</span>
                          <span className="info-value">{s.search_url || '(no configurada)'}</span>

                          <span className="info-label">🎯 Props:</span>
                          <span className="info-value">
                            {(s.properties_object_semantic_structure_schema || [])
                              .map((p: PropertySchema) => p.name_schema)
                              .join(', ') || '(sin propiedades)'}
                          </span>
                        </div>

                        <div className="structure-card-selectors">
                          <div className="sel-row">
                            <span className="sel-name">container:</span>
                            <span className="sel-value">{s.result_container_selector || '—'}</span>
                          </div>
                          {(s.properties_object_semantic_structure_schema || []).map((prop: PropertySchema, idx: number) => (
                            <div key={idx} className="sel-row">
                              <span className="sel-name">
                                <span style={{ color: '#6c5ce7' }}>[{prop.type_schema}]</span> {prop.name_schema}:
                              </span>
                              <span className="sel-value">{prop.selector_css_schema || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {result && result.action === "createStructure" && (
              <div className="result-area">
                <div className="result-structure">
                  <div className="structure-header">
                    <h4>🧠 Estructura creada: {(result as CreateStructureResult).structure.name}</h4>
                  </div>

                  <div className="structure-details">
                    <div className="detail-row">
                      <span className="detail-label">🌐 URL:</span>
                      <span className="detail-value">{(result as CreateStructureResult).structure.url}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">📂 Dominio:</span>
                      <span className="detail-value">{(result as CreateStructureResult).structure.domain}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">🔍 Búsqueda:</span>
                      <span className="detail-value">{(result as CreateStructureResult).structure.search_url || '(no detectada)'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">📚 Tipo objeto:</span>
                      <span className="detail-value">{(result as CreateStructureResult).structure.object_semantic_structure_schema.type}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">🎯 Contenedor:</span>
                      <span className="detail-value" style={{ fontFamily: 'monospace', fontSize: '10px' }}>
                        {(result as CreateStructureResult).structure.result_container_selector}
                      </span>
                    </div>
                  </div>

                  <div className="selectors-grid">
                    <strong style={{ fontSize: '11px', color: '#1b5e20' }}>
                      Propiedades ({(result as CreateStructureResult).structure.properties_object_semantic_structure_schema.length}):
                    </strong>
                    {(result as CreateStructureResult).structure.properties_object_semantic_structure_schema.map((prop: PropertySchema, idx: number) => (
                      <div key={idx} className="selector-row">
                        <span className="selector-name">
                          <span style={{ color: '#6c5ce7', fontSize: '8px' }}>[{prop.type_schema}]</span> {prop.name_schema}:
                        </span>
                        <span className="selector-value">{prop.selector_css_schema}</span>
                      </div>
                    ))}
                  </div>

                  <div className="structure-message">
                    ✅ {(result as CreateStructureResult).message}
                  </div>
                </div>
              </div>
            )}

            {result && result.action === "searchSiteVisible" && (
              <div className="result-area">
                <div className="result-success">
                  🚀 {result.message}
                  <div style={{ marginTop: "6px", fontSize: "11px" }}>
                    🔗 <a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a>
                  </div>
                </div>
              </div>
            )}

            {result && result.action === "highlightByCondition" && (
              <div className="result-area">
                <div className="result-success">
                  ✨ {result.message}
                </div>
              </div>
            )}

            {result && result.action === "scrapeResults" && (
              <div className="result-area">
                <div className="result-scrape">
                  <div className="scrape-header">
                    <h4>🔬 {(result as ScrapeResult).source} — {(result as ScrapeResult).totalResults} resultados</h4>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="json-toggle-btn"
                        onClick={() => setShowJson(!showJson)}>
                        {showJson ? '📋 Vista' : '{ } JSON'}
                      </button>
                      <button
                        className="copy-json-btn"
                        onClick={() => {
                          const jsonStr = JSON.stringify(result, null, 2)
                          navigator.clipboard.writeText(jsonStr)
                            .then(() => alert('JSON copiado al portapapeles'))
                            .catch(() => {
                              const textArea = document.createElement('textarea')
                              textArea.value = jsonStr
                              document.body.appendChild(textArea)
                              textArea.select()
                              document.execCommand('copy')
                              document.body.removeChild(textArea)
                              alert('JSON copiado al portapapeles')
                            })
                        }}>
                        📋 Copiar
                      </button>
                    </div>
                  </div>

                  <div className="scrape-meta">
                    🔍 Query: <strong>{(result as ScrapeResult).query}</strong> | 
                    📚 Tipo: {(result as ScrapeResult).semantic_type} | 
                    🌐 {(result as ScrapeResult).domain} |
                    🎯 Props: {(result as ScrapeResult).properties?.join(', ')}
                  </div>

                  {showJson ? (
                    <div className="json-view">
                      <pre>{JSON.stringify(result, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="scrape-articles">
                      {(result as ScrapeResult).results.map((item: ScrapedItem, i: number) => (
                        <div key={`item-${i}`} className="scrape-article">
                          {/* Título: buscar propiedad "title" o "name" */}
                          {(item.title || item.name) && (
                            item.url ? (
                              <a
                                className="scrape-article-title"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer">
                                {item.title || item.name}
                              </a>
                            ) : (
                              <span className="scrape-article-title">{item.title || item.name}</span>
                            )
                          )}
                          
                          {/* Renderizar todas las propiedades dinámicas (excepto title, name, url ya mostrados) */}
                          {Object.entries(item)
                            .filter(([key]) => !['title', 'name', 'url'].includes(key))
                            .map(([key, value]) => {
                              if (!value || value === '' || value === '0' || (Array.isArray(value) && value.length === 0)) return null
                              
                              const displayValue = Array.isArray(value) ? value.join(', ') : String(value)
                              if (!displayValue || displayValue.length === 0) return null

                              return (
                                <div key={key} className="scrape-article-meta" style={{ marginBottom: '2px' }}>
                                  <span style={{ fontWeight: 600, color: '#555', fontSize: '10px' }}>
                                    {key}:
                                  </span>{' '}
                                  <span style={{ color: '#666', fontSize: '10px' }}>
                                    {displayValue.length > 200
                                      ? displayValue.substring(0, 200) + '...'
                                      : displayValue}
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {result && result.action === "chainSearch" && (
              <div className="result-area">
                <div className="result-scrape">
                  <div className="scrape-header">
                    <h4>🔗 Cadena: {result.source} → {result.target}</h4>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="json-toggle-btn"
                        onClick={() => setShowJson(!showJson)}>
                        {showJson ? '📋 Vista' : '{ } JSON'}
                      </button>
                    </div>
                  </div>

                  <div className="scrape-meta">
                    🔍 Query origen: <strong>{result.sourceQuery}</strong> |
                    🎯 Enriquecimiento: {result.targetProperty} |
                    🧭 Selección: {result.selection} |
                    ✅ Enriquecidos: {result.enrichedItems}/{result.totalSourceItems}
                  </div>

                  {showJson ? (
                    <div className="json-view">
                      <pre>{JSON.stringify(result, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="scrape-articles">
                      {(result.results || []).map((item: ScrapedItem, i: number) => (
                        <div key={`chain-item-${i}`} className="scrape-article">
                          {(item.title || item.name) && (
                            item.url ? (
                              <a
                                className="scrape-article-title"
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer">
                                {item.title || item.name}
                              </a>
                            ) : (
                              <span className="scrape-article-title">{item.title || item.name}</span>
                            )
                          )}

                          {Object.entries(item)
                            .filter(([key]) => !['title', 'name', 'url'].includes(key))
                            .map(([key, value]) => {
                              if (!value || value === '' || value === '0' || (Array.isArray(value) && value.length === 0)) return null
                              const displayValue = Array.isArray(value) ? value.join(', ') : String(value)
                              if (!displayValue) return null
                              return (
                                <div key={key} className="scrape-article-meta" style={{ marginBottom: '2px' }}>
                                  <span style={{ fontWeight: 600, color: '#555', fontSize: '10px' }}>
                                    {key}:
                                  </span>{' '}
                                  <span style={{ color: '#666', fontSize: '10px' }}>
                                    {displayValue.length > 200 ? displayValue.substring(0, 200) + '...' : displayValue}
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="hint-text">
              🤖 Todo pasa por IA — escribe naturalmente.
              <br />
              Ej: "crea la estructura" → "en scholar busca iot"
              <br />
              Ej visible: "en scholar busca iot visible"
              <br />
              Ej highlight: "resalta artículos con más de 100 citas"
              <br />
              📂 "ver sitios" para listar las estructuras guardadas.
            </div>
          </div>
        </div>
      )}

      <button
        className={`floating-icon ${isOpen ? "active" : ""}`}
        data-build={BUILD_TAG}
        onClick={() => setIsOpen(!isOpen)}
        title={`Títulos App - IA (${BUILD_TAG})`}>
        {isOpen ? "✕" : "🤖"}
      </button>
    </div>
  )
}

export default FloatingPrompt
