// src/background.ts
// Background service worker - maneja las llamadas API de IA y fetch de páginas
// En MV3, solo el background tiene acceso cross-origin con host_permissions

import { PREDEFINED_COLORS } from "./utils/colorUtils"

// ============ Tipos de mensajes ============

interface AIRequest {
  type: "AI_PARSE_COMMAND"
  input: string
  provider: "groq" | "openai" | "anthropic" | "google"
  apiKey: string
  model?: string
}

interface AIAnalyzePageRequest {
  type: "AI_ANALYZE_PAGE"
  html: string
  url: string
  pageTitle: string
  provider: "groq" | "openai" | "anthropic" | "google"
  apiKey: string
  model?: string
}

interface FetchPageRequest {
  type: "FETCH_PAGE"
  url: string
}

interface AIResponse {
  success: boolean
  command?: { action: string; params: Record<string, any> } | null
  error?: string
}

interface AnalyzePageResponse {
  success: boolean
  structure?: any
  error?: string
}

interface FetchPageResponse {
  success: boolean
  html?: string
  error?: string
}

type MessageRequest = AIRequest | AIAnalyzePageRequest | FetchPageRequest

// ============ Listener principal ============

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (response: any) => void) => {
    if (message.type === "AI_PARSE_COMMAND") {
      handleAIRequest(message as AIRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            success: false,
            error: err.message || "Error desconocido en background"
          })
        })
      return true
    }

    if (message.type === "AI_ANALYZE_PAGE") {
      handleAnalyzePage(message as AIAnalyzePageRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            success: false,
            error: err.message || "Error al analizar la página"
          })
        })
      return true
    }

    if (message.type === "FETCH_PAGE") {
      handleFetchPage(message as FetchPageRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            success: false,
            error: err.message || "Error al obtener la página"
          })
        })
      return true
    }
  }
)

// ============ Handler: Fetch de página ============

async function handleFetchPage(request: FetchPageRequest): Promise<FetchPageResponse> {
  try {
    const response = await fetch(request.url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
      }
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Error HTTP ${response.status}: ${response.statusText}`
      }
    }

    const html = await response.text()
    return { success: true, html }
  } catch (err: any) {
    return {
      success: false,
      error: `Error al obtener la página: ${err.message}`
    }
  }
}

// ============ Handler: Parseo de comandos DSL ============

async function handleAIRequest(request: AIRequest): Promise<AIResponse> {
  const { input, provider, apiKey, model } = request

  try {
    let command = null

    switch (provider) {
      case "groq":
        command = await callAI(provider, apiKey, model || "llama-3.1-8b-instant", buildDSLPrompt(), input)
        break
      case "openai":
        command = await callAI(provider, apiKey, model || "gpt-4o-mini", buildDSLPrompt(), input)
        break
      case "anthropic":
        command = await callAI(provider, apiKey, model || "claude-3-haiku-20240307", buildDSLPrompt(), input)
        break
      case "google":
        command = await callAI(provider, apiKey, model || "gemini-2.0-flash", buildDSLPrompt(), input)
        break
      default:
        return { success: false, error: `Proveedor no soportado: ${provider}` }
    }

    return { success: true, command }
  } catch (error: any) {
    console.error("[Background] Error al parsear con IA:", error)
    return { success: false, error: error.message || "Error al comunicarse con la IA" }
  }
}

// ============ Handler: Análisis de página para crear estructura ============

async function handleAnalyzePage(request: AIAnalyzePageRequest): Promise<AnalyzePageResponse> {
  const { html, url, pageTitle, provider, apiKey, model } = request

  try {
    const systemPrompt = buildAnalyzePagePrompt()
    const userMessage = `URL: ${url}\nTítulo de la página: ${pageTitle}\n\nHTML simplificado de la página:\n${html}`

    let defaultModel = ""
    switch (provider) {
      case "groq": defaultModel = "llama-3.1-8b-instant"; break
      case "openai": defaultModel = "gpt-4o-mini"; break
      case "anthropic": defaultModel = "claude-3-haiku-20240307"; break
      case "google": defaultModel = "gemini-2.0-flash"; break
    }

    const result = await callAI(provider, apiKey, model || defaultModel, systemPrompt, userMessage)
    console.log('result', result)
    if (!result || !result.selectors) {
      
      return { success: false, error: "La IA no pudo identificar la estructura de la página" }
    }

    return { success: true, structure: result }
  } catch (error: any) {
    console.error("[Background] Error al analizar página:", error)
    return { success: false, error: error.message || "Error al analizar la página" }
  }
}

// ============ Llamada genérica a IA (todos los proveedores) ============

async function callAI(
  provider: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  switch (provider) {
    case "groq":
      return await callOpenAICompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        apiKey, model, systemPrompt, userMessage
      )
    case "openai":
      return await callOpenAICompatible(
        "https://api.openai.com/v1/chat/completions",
        apiKey, model, systemPrompt, userMessage
      )
    case "anthropic":
      return await callClaude(apiKey, model, systemPrompt, userMessage)
    case "google":
      return await callGemini(apiKey, model, systemPrompt, userMessage)
    default:
      throw new Error(`Proveedor no soportado: ${provider}`)
  }
}

// ============ Proveedores de IA ============

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    let errorDetail = ""
    try {
      const errorJson = JSON.parse(errorBody)
      errorDetail = errorJson?.error?.message || errorBody
    } catch {
      errorDetail = errorBody
    }
    throw new Error(`${endpoint.includes('groq') ? 'Groq' : 'OpenAI'} error (${response.status}): ${errorDetail}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error("El modelo no devolvió contenido en la respuesta")
  }

  return JSON.parse(content)
}

async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    throw new Error(`Claude error (${response.status}): ${response.statusText}. ${errorBody}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    throw new Error("Claude no devolvió contenido en la respuesta")
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("Claude no devolvió JSON válido")
  }

  return JSON.parse(jsonMatch[0])
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string
): Promise<any> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    }
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    let errorDetail = ""
    try {
      const errorJson = JSON.parse(errorBody)
      errorDetail = errorJson?.error?.message || errorBody
    } catch {
      errorDetail = errorBody
    }
    throw new Error(`Gemini error (${response.status}): ${errorDetail}`)
  }

  const data = await response.json()
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!content) {
    throw new Error("Gemini no devolvió contenido en la respuesta")
  }

  return JSON.parse(content)
}

// ============ System Prompt: Parseo de comandos DSL ============

function buildDSLPrompt(): string {
  const colorsList = PREDEFINED_COLORS.filter((c) => c.value !== null)
    .map((c) => `- ${c.name}: ${c.value}`)
    .join("\n")

  return `Eres un parser que convierte lenguaje natural en español a comandos DSL (Domain Specific Language).

COMANDOS DISPONIBLES:

1. changeColor: Cambia el color de los títulos (H1, H2, H3) de una página web
   - Parámetros: { "color": string | null }
   - Colores disponibles:
${colorsList}
   - Si el color es null, restaura los colores originales
   - Ejemplos de uso: "cambiar color a rojo", "poner títulos en azul", "restaurar colores"

2. getTitles: Obtiene los títulos de la página actual
   - Parámetros: {}
   - Ejemplos: "mostrar títulos", "listar títulos", "obtener títulos"

3. scrapeResults: Extrae/scrapea los resultados estructurados de la página actual
   - Parámetros: {}
   - Ejemplos: "extraer resultados", "scrapear página", "obtener artículos", "recoger datos"

4. searchSite: Busca en un sitio configurado y extrae los resultados automáticamente
   - Parámetros: { "site": string, "query": string }
   - "site" es el nombre del sitio (ej: "Google Scholar", "Springer", "DBLP")
   - "query" es lo que el usuario quiere buscar
   - Ejemplos: "en google scholar busca iot", "busca machine learning en springer", "en dblp busca deep learning"

5. createStructure: Analiza la página actual y crea la estructura de scraping con IA
   - Parámetros: {}
   - Ejemplos: "crea la estructura", "analiza esta página", "genera la estructura", "configura este sitio", "aprende este sitio", "analiza los selectores"

6. listStructures: Muestra todas las estructuras de sitios guardadas
   - Parámetros: {}
   - Ejemplos: "mostrar estructuras", "listar sitios", "ver estructuras", "qué sitios hay", "mostrar sitios configurados", "ver sitios guardados"

7. deleteStructure: Elimina una estructura guardada por nombre
   - Parámetros: { "name": string }
   - "name" es el nombre del sitio a eliminar
   - Ejemplos: "elimina la estructura de DBLP", "borra el sitio Springer", "eliminar estructura Google Scholar"

INSTRUCCIONES:
- Responde SOLO con un objeto JSON válido
- Formatos:
  { "action": "changeColor", "params": { "color": "#ff0000" } }
  { "action": "getTitles", "params": {} }
  { "action": "scrapeResults", "params": {} }
  { "action": "searchSite", "params": { "site": "Google Scholar", "query": "iot" } }
  { "action": "createStructure", "params": {} }
  { "action": "listStructures", "params": {} }
  { "action": "deleteStructure", "params": { "name": "DBLP" } }
- Si no entiendes el comando: { "action": null, "params": {} }
- Para buscar EN un sitio: usa searchSite
- Para extraer datos de la página actual: usa scrapeResults
- Para analizar/aprender la estructura de una página: usa createStructure
- Para ver las estructuras guardadas: usa listStructures
- Para eliminar una estructura: usa deleteStructure
- "scholar" = "Google Scholar", "springer" = "Springer", "dblp" = "DBLP"`
}

// ============ System Prompt: Análisis de estructura de página ============

function buildAnalyzePagePrompt(): string {
  return `Eres un experto en web scraping. Tu tarea es analizar el HTML de una página de resultados de búsqueda y devolver los selectores CSS que permiten extraer datos estructurados.

INSTRUCCIONES:
1. Analiza el HTML proporcionado de una página de resultados de búsqueda (académica, bibliográfica, etc.)
2. Identifica:
   - El CONTENEDOR de cada resultado individual (el div/article/li que se repite por cada resultado)
   - El TÍTULO de cada resultado
   - El LINK del título (el <a> que envuelve al título)
   - Los AUTORES (texto o links)
   - La FECHA o AÑO de publicación
   - El ABSTRACT o snippet/resumen
   - Las CITACIONES (si existen)
3. Identifica la URL de búsqueda del sitio y los parámetros de búsqueda

RESPONDE SOLO con un JSON válido con esta estructura exacta:
{
  "name": "Nombre del sitio (ej: Google Scholar, Springer, DBLP)",
  "url": "URL base del sitio (ej: https://scholar.google.com)",
  "domain": "Dominio temático (ej: academic, scientific, bibliographic)",
  "search_url": "URL de búsqueda con {query} como placeholder (ej: https://scholar.google.com/scholar?q={query})",
  "search_params": { "q": "query" },
  "selectors": {
    "resultContainer": "selector CSS del contenedor de CADA resultado",
    "title": "selector CSS del título dentro del contenedor",
    "titleLink": "selector CSS del link del título",
    "authors": "selector CSS del texto de autores",
    "authorLinks": "selector CSS de los links de autores",
    "date": "selector CSS del elemento que contiene la fecha",
    "abstract": "selector CSS del abstract/snippet",
    "citations": "selector CSS del elemento con info de citaciones"
  },
  "semantic_structure": {
    "type": "Tipo semántico (ej: ArticleScientific, ConferencePaper, JournalArticle)"
  }
}

REGLAS IMPORTANTES:
- Los selectores deben ser CSS válidos y lo más específicos posible
- El "resultContainer" es el selector del elemento que se REPITE una vez por cada resultado
- Los otros selectores son RELATIVOS al resultContainer (dentro de cada resultado)
- Si un campo no existe en la página, usa una cadena vacía ""
- search_url debe tener {query} donde va el término de búsqueda
- Analiza la URL proporcionada para deducir search_url y search_params
- Si el selector usa clases, prefiere clases específicas del sitio (no genéricas como "text" o "container")
- Para citaciones, busca links o texto que contenga "Cited by", "Citado por", "citations", etc.
- SIEMPRE responde con JSON válido, nada más`
}
