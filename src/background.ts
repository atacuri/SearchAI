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

interface OpenTabRequest {
  type: "OPEN_TAB"
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

interface OpenTabResponse {
  success: boolean
  tabId?: number
  url?: string
  error?: string
}

type MessageRequest = AIRequest | AIAnalyzePageRequest | FetchPageRequest | OpenTabRequest

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

    if (message.type === "OPEN_TAB") {
      handleOpenTab(message as OpenTabRequest)
        .then(sendResponse)
        .catch((err) => {
          sendResponse({
            success: false,
            error: err.message || "Error al abrir la pestaña"
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

// ============ Handler: Abrir nueva pestaña ============

async function handleOpenTab(request: OpenTabRequest): Promise<OpenTabResponse> {
  try {
    const tab = await chrome.tabs.create({
      url: request.url,
      active: true
    })

    return {
      success: true,
      tabId: tab.id,
      url: tab.url || request.url
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Error al abrir pestaña: ${err.message}`
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
    console.log('[Background] AI analyze result:', result)
    if (!result || !result.result_container_selector || !result.properties_object_semantic_structure_schema) {
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

4. searchSite: Busca en un sitio configurado y extrae los resultados automáticamente (modo invisible)
   - Parámetros: { "site": string, "query": string }
   - "site" es el nombre del sitio (ej: "Google Scholar", "Springer", "DBLP")
   - "query" es lo que el usuario quiere buscar
   - Ejemplos: "en google scholar busca iot invisible", "busca machine learning en springer en segundo plano", "en dblp busca deep learning sin abrir pestaña"

5. searchSiteVisible: Busca en un sitio configurado y abre la búsqueda en una pestaña nueva (visible)
   - Parámetros: { "site": string, "query": string }
   - Ejemplos: "en google scholar busca iot", "abre en nueva pestaña google scholar con iot", "en google scholar busca iot visible", "quiero ver la búsqueda en springer de llm"

6. createStructure: Analiza la página actual y crea la estructura de scraping con IA
   - Parámetros: {}
   - Ejemplos: "crea la estructura", "analiza esta página", "genera la estructura", "configura este sitio", "aprende este sitio", "analiza los selectores"

7. listStructures: Muestra todas las estructuras de sitios guardadas
   - Parámetros: {}
   - Ejemplos: "mostrar estructuras", "listar sitios", "ver estructuras", "qué sitios hay", "mostrar sitios configurados", "ver sitios guardados"

8. deleteStructure: Elimina una estructura guardada por nombre
   - Parámetros: { "name": string }
   - "name" es el nombre del sitio a eliminar
   - Ejemplos: "elimina la estructura de DBLP", "borra el sitio Springer", "eliminar estructura Google Scholar"

9. highlightByCondition: Resalta en la página actual solo los resultados que cumplen una condición
   - Parámetros: { "property": string, "operator": string, "value": number|string }
   - "property" es el nombre de la propiedad (ej: citations, price, year, rating)
   - "operator" puede ser: ">", ">=", "<", "<=", "=", "!=", "contains"
   - "value" es el valor a comparar
   - Ejemplos: "resalta artículos con más de 100 citas", "resaltar productos con precio mayor a 500", "marca resultados con year >= 2020"

10. chainSearch: Encadena búsquedas entre dos sitios y enriquece cada item del origen con datos del destino
   - Parámetros:
     {
       "sourceSite": string,
       "sourceQuery": string,
       "sourceProperty": string,
       "targetSite": string,
       "targetProperty": string,
       "selection": "first result" | "best result" | "All",
       "maxItems": number
     }
   - La búsqueda del sourceSite se ejecuta en modo invisible
   - La búsqueda del targetSite se ejecuta en modo invisible por cada item del origen
   - "sourceProperty" suele ser "title"
   - "targetProperty" suele ser "citations"
   - "selection" define cómo elegir en el sitio destino:
     ${JSON.stringify(type_of_search)}
   - Ejemplos:
     "Busca en springer IOT y por cada resultado toma el título y busca citas en google scholar con best result"
     "En DBLP busca llm y por cada paper consulta en scholar usando first result"

INSTRUCCIONES:
- Responde SOLO con un objeto JSON válido
- Formatos:
  { "action": "changeColor", "params": { "color": "#ff0000" } }
  { "action": "getTitles", "params": {} }
  { "action": "scrapeResults", "params": {} }
  { "action": "searchSite", "params": { "site": "Google Scholar", "query": "iot" } }
  { "action": "searchSiteVisible", "params": { "site": "Google Scholar", "query": "iot" } }
  { "action": "createStructure", "params": {} }
  { "action": "listStructures", "params": {} }
  { "action": "deleteStructure", "params": { "name": "DBLP" } }
  { "action": "highlightByCondition", "params": { "property": "citations", "operator": ">", "value": 100 } }
  {
    "action": "chainSearch",
    "params": {
      "sourceSite": "Springer",
      "sourceQuery": "iot",
      "sourceProperty": "title",
      "targetSite": "Google Scholar",
      "targetProperty": "citations",
      "selection": "best result",
      "maxItems": 10
    }
  }
- Si no entiendes el comando: { "action": null, "params": {} }
- Por defecto, para frases tipo "en [sitio] busca [query]": usa searchSiteVisible
- Si el usuario pide "invisible", "invisble", "invislbe", "invsible", "en segundo plano", "sin abrir pestaña": usa searchSite (modo invisible + extracción)
- En sitios que bloquean el fetch invisible (ej. challenge anti-bot), el executor hará fallback automático a modo visible
- Para extraer datos de la página actual: usa scrapeResults
- Para analizar/aprender la estructura de una página: usa createStructure
- Para ver las estructuras guardadas: usa listStructures
- Para eliminar una estructura: usa deleteStructure
- Para resaltar resultados por condición en la página actual: usa highlightByCondition
- Para búsquedas encadenadas entre sitios (enriquecer items): usa chainSearch
- "scholar" = "Google Scholar", "springer" = "Springer", "dblp" = "DBLP"`
}

// ============ System Prompt: Análisis de estructura de página ============

/**
 * Schema base leído de structureSearchAI.json — define el formato de salida esperado.
 * La IA debe generar la estructura siguiendo este schema.
 */
const STRUCTURE_SCHEMA = {
  name: "Nombre del sitio (ej: Google Scholar, Springer, DBLP)",
  url: "URL base del sitio (ej: https://scholar.google.com)",
  domain: "Dominio temático (ej: academic, scientific, bibliographic, e-commerce, news)",
  search_url: "URL de búsqueda con {query} como placeholder (ej: https://scholar.google.com/scholar?q={query})",
  search_params: { q: "query" },
  result_container_selector: "Selector CSS del contenedor que se REPITE por cada resultado",
  object_semantic_structure_schema: {
    type: "Tipo semántico del objeto (ej: ArticleScientific, ConferencePaper, Product, NewsArticle)"
  },
  properties_schema: {
    type_schema: "Tipo de extracción: string | url | number | date | array | html",
    name_schema: "Nombre de la propiedad (ej: title, authors, price, date)",
    selector_css_schema: "Selector CSS relativo al contenedor del resultado"
  },
  properties_object_semantic_structure_schema: [
    "Array de propiedades del objeto, cada una con la estructura de properties_schema"
  ]
}



const type_of_search= [
  {
    name: "first result",
    number_results: "1"
  }, {
    name: "best result",
    number_results: "1"
  }, {
    name: "All",
    number_results: "All"
  }]



function buildAnalyzePagePrompt(): string {
  return `Eres un experto en web scraping y análisis de estructuras HTML. Tu tarea es analizar una página web y crear una estructura COMPLETA de scraping extrayendo TODAS las propiedades visibles.

SCHEMA DE SALIDA:
${JSON.stringify(STRUCTURE_SCHEMA, null, 2)}

INSTRUCCIONES:
1. Analiza el HTML proporcionado de forma EXHAUSTIVA
2. Identifica QUÉ TIPO DE OBJETO se repite en la página (artículos, productos, noticias, etc.)
3. Identifica el CONTENEDOR CSS que se repite por cada resultado (result_container_selector)
4. Extrae TODAS las propiedades visibles del objeto. Debes identificar MÍNIMO 5 propiedades por objeto.
5. Para cada propiedad, crea una entrada en "properties_object_semantic_structure_schema" con:
   - "type_schema": cómo extraer el dato:
     * "string" → extrae textContent del elemento
     * "url" → extrae el atributo href de un <a>
     * "number" → extrae un número del textContent
     * "date" → extrae un patrón de fecha/año del textContent
     * "array" → extrae múltiples matches como array de strings
     * "html" → extrae innerHTML
   - "name_schema": nombre descriptivo de la propiedad (ej: title, authors, price, abstract)
   - "selector_css_schema": selector CSS RELATIVO al contenedor del resultado
6. Identifica la URL de búsqueda y los parámetros

PROPIEDADES COMUNES POR TIPO DE SITIO (debes buscar TODAS estas y más):

Para sitios ACADÉMICOS: title, url, authors, date, abstract, citations, journal, publisher, doi, volume
Para sitios E-COMMERCE: name, url, price, rating, reviews_count, seller, brand, availability, description, shipping_info
Para sitios de NOTICIAS: title, url, author, date, summary, category, source, image_alt
Para BIBLIOTECAS/BASES DE DATOS: title, url, authors, year, venue, type, pages, doi, keywords

EJEMPLO para un sitio académico (6 propiedades):
{
  "name": "Google Scholar",
  "url": "https://scholar.google.com",
  "domain": "academic",
  "search_url": "https://scholar.google.com/scholar?q={query}",
  "search_params": { "q": "query" },
  "result_container_selector": ".gs_r.gs_or.gs_scl",
  "object_semantic_structure_schema": { "type": "ArticleScientific" },
  "properties_object_semantic_structure_schema": [
    { "type_schema": "string", "name_schema": "title", "selector_css_schema": ".gs_rt" },
    { "type_schema": "url", "name_schema": "url", "selector_css_schema": ".gs_rt a" },
    { "type_schema": "string", "name_schema": "authors", "selector_css_schema": ".gs_a" },
    { "type_schema": "date", "name_schema": "date", "selector_css_schema": ".gs_a" },
    { "type_schema": "string", "name_schema": "abstract", "selector_css_schema": ".gs_rs" },
    { "type_schema": "string", "name_schema": "citations", "selector_css_schema": ".gs_fl a" }
  ]
}

EJEMPLO para e-commerce (7 propiedades):
{
  "name": "Amazon",
  "url": "https://www.amazon.com",
  "domain": "e-commerce",
  "search_url": "https://www.amazon.com/s?k={query}",
  "search_params": { "k": "query" },
  "result_container_selector": "[data-component-type='s-search-result']",
  "object_semantic_structure_schema": { "type": "Product" },
  "properties_object_semantic_structure_schema": [
    { "type_schema": "string", "name_schema": "name", "selector_css_schema": "h2 a span" },
    { "type_schema": "url", "name_schema": "url", "selector_css_schema": "h2 a.a-link-normal" },
    { "type_schema": "string", "name_schema": "price", "selector_css_schema": ".a-price .a-offscreen" },
    { "type_schema": "string", "name_schema": "rating", "selector_css_schema": ".a-icon-alt" },
    { "type_schema": "string", "name_schema": "reviews_count", "selector_css_schema": "a.s-underline-text span.a-size-base" },
    { "type_schema": "string", "name_schema": "delivery", "selector_css_schema": ".a-color-base.a-text-bold" },
    { "type_schema": "string", "name_schema": "brand", "selector_css_schema": ".a-size-base-plus.a-color-base" }
  ]
}

REGLAS CRÍTICAS:
- Debes encontrar MÍNIMO 5 propiedades. Si ves texto en la página, hay una propiedad para él
- Analiza CADA elemento visible dentro del contenedor: títulos, precios, textos, links, badges, etc.
- Los selectores CSS deben ser VÁLIDOS y lo más ESPECÍFICOS posible
- Usa atributos data-* cuando existan (ej: [data-component-type='s-search-result'])
- result_container_selector es el selector del elemento que se REPITE una vez por cada resultado
- Los selectores de propiedades son RELATIVOS al contenedor (dentro de cada resultado)
- search_url debe tener {query} donde va el término de búsqueda
- Analiza la URL proporcionada para deducir search_url y search_params
- Prefiere clases CSS específicas del sitio (no genéricas como "text" o "container")
- El "type" en object_semantic_structure_schema debe reflejar QUÉ es el objeto (Article, Product, etc.)
- SIEMPRE responde con JSON válido, nada más
- NO incluyas el campo "properties_schema" en la respuesta, solo "properties_object_semantic_structure_schema"
- Si hay precio, SIEMPRE inclúyelo. Si hay nombre/título, SIEMPRE inclúyelo. Si hay URL, SIEMPRE inclúyelo.`
}
