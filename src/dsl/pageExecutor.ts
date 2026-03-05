// src/dsl/pageExecutor.ts
// Executor que trabaja directamente en el DOM de la página
// searchSite: fetch invisible via background + parsea con DOMParser
// searchSiteVisible: abre la búsqueda en una pestaña nueva
// createStructure: IA analiza el HTML y genera selectores CSS automáticamente

import type { DSLCommand, SiteStructure, CreateStructureResult, ListStructuresResult } from '../types'
import { scrapeCurrentPage, scrapeFromHtml, simplifyHtmlForAI } from '../services/scraperService'
import { getStructureByName, buildSearchUrl, getAllStructures, saveStructure, deleteStructure } from '../services/structureStorage'
import { getAIConfig } from '../services/aiService'

export async function executePageCommand(command: DSLCommand): Promise<any> {
  switch (command.action) {
    case 'changeColor':
      return changeColor(command.params.color)

    case 'getTitles':
      return getTitles()

    case 'scrapeResults':
      return await scrapeCurrentPage()

    case 'searchSite':
      return await searchSite(command.params.site, command.params.query)

    case 'searchSiteVisible':
      return await searchSiteVisible(command.params.site, command.params.query)

    case 'createStructure':
      return await createStructure()

    case 'listStructures':
      return await listStructures()

    case 'deleteStructure':
      return await removeStructure(command.params.name)

    case 'highlightByCondition':
      return await highlightByCondition(
        command.params.property,
        command.params.operator,
        command.params.value
      )

    default:
      throw new Error(`Comando desconocido: ${command.action}`)
  }
}

/**
 * Lista todas las estructuras de sitios guardadas en chrome.storage.local
 */
async function listStructures(): Promise<ListStructuresResult> {
  const structures = await getAllStructures()
  return {
    action: 'listStructures',
    structures,
    total: structures.length
  }
}

/**
 * Elimina una estructura por nombre
 */
async function removeStructure(name: string): Promise<any> {
  if (!name) {
    throw new Error('Se necesita el nombre del sitio a eliminar. Ejemplo: "elimina la estructura de DBLP"')
  }

  const structure = await getStructureByName(name)
  if (!structure) {
    const allStructures = await getAllStructures()
    const names = allStructures.map(s => s.name).join(', ')
    throw new Error(`No se encontró estructura "${name}". Sitios disponibles: ${names}`)
  }

  await deleteStructure(name)
  return {
    action: 'deleteStructure',
    success: true,
    name: structure.name,
    message: `Estructura "${structure.name}" eliminada correctamente.`
  }
}

/**
 * Analiza la página actual con IA para crear la estructura de scraping genérica.
 * 1. Simplifica el HTML de la página
 * 2. Envía al background → IA analiza y devuelve propiedades dinámicas
 * 3. Guarda la estructura en chrome.storage.local
 * 4. Retorna la estructura creada con todas sus propiedades
 */
async function createStructure(): Promise<CreateStructureResult> {
  // Verificar que la IA esté configurada
  const aiConfig = await getAIConfig()
  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error('Necesitas configurar tu API key de IA primero para analizar páginas.')
  }

  // Simplificar el HTML para enviarlo a la IA
  const simplifiedHtml = simplifyHtmlForAI(document)
  const currentUrl = window.location.href
  const pageTitle = document.title

  if (!simplifiedHtml || simplifiedHtml.length < 100) {
    throw new Error('La página no tiene suficiente contenido HTML para analizar.')
  }

  // Enviar al background para que la IA analice
  const response = await chrome.runtime.sendMessage({
    type: 'AI_ANALYZE_PAGE',
    html: simplifiedHtml,
    url: currentUrl,
    pageTitle,
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model
  })

  if (!response || !response.success) {
    throw new Error(response?.error || 'Error al analizar la página con IA')
  }

  const aiStructure = response.structure

  // Validar que la IA devolvió una estructura válida con propiedades
  if (!aiStructure || !aiStructure.result_container_selector) {
    throw new Error(
      'La IA no pudo identificar el contenedor de resultados en esta página. ' +
      'Asegúrate de estar en una página con resultados de búsqueda visibles.'
    )
  }

  if (!aiStructure.properties_object_semantic_structure_schema || 
      !Array.isArray(aiStructure.properties_object_semantic_structure_schema) ||
      aiStructure.properties_object_semantic_structure_schema.length === 0) {
    throw new Error(
      'La IA no pudo identificar las propiedades de los resultados. ' +
      'Intenta en una página con más resultados visibles.'
    )
  }

  // Construir la estructura completa con propiedades dinámicas
  const structure: SiteStructure = {
    name: aiStructure.name || extractSiteName(currentUrl),
    url: aiStructure.url || new URL(currentUrl).origin,
    domain: aiStructure.domain || 'general',
    search_url: aiStructure.search_url || '',
    search_params: aiStructure.search_params || {},
    result_container_selector: aiStructure.result_container_selector,
    object_semantic_structure_schema: aiStructure.object_semantic_structure_schema || { type: 'General' },
    properties_object_semantic_structure_schema: aiStructure.properties_object_semantic_structure_schema.map(
      (p: any) => ({
        type_schema: p.type_schema || 'string',
        name_schema: p.name_schema || '',
        selector_css_schema: p.selector_css_schema || ''
      })
    ).filter((p: any) => p.name_schema && p.selector_css_schema)
  }

  // Guardar la estructura en chrome.storage.local
  await saveStructure(structure)

  // Verificar cuántos resultados encuentra con el selector de contenedor
  const testResults = document.querySelectorAll(structure.result_container_selector)
  const propNames = structure.properties_object_semantic_structure_schema.map(p => p.name_schema).join(', ')

  return {
    action: 'createStructure',
    success: true,
    structure,
    message: `Estructura creada para "${structure.name}" (${structure.object_semantic_structure_schema.type}). ` +
      `Se detectaron ${testResults.length} resultados con ${structure.properties_object_semantic_structure_schema.length} propiedades: ${propNames}. ` +
      `Ahora puedes usar "extraer resultados" o "en ${structure.name} busca [algo]".`
  }
}

/**
 * Extrae un nombre legible del sitio a partir de la URL
 */
function extractSiteName(url: string): string {
  try {
    const hostname = new URL(url).hostname
    // Quitar www. y TLD
    const parts = hostname.replace('www.', '').split('.')
    if (parts.length >= 2) {
      return parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    }
    return hostname
  } catch {
    return 'Sitio desconocido'
  }
}

/**
 * Buscar en un sitio de forma INVISIBLE:
 * 1. Obtiene la estructura del sitio desde chrome.storage
 * 2. Construye la URL de búsqueda con la query
 * 3. Envía FETCH_PAGE al background → fetch cross-origin oculto
 * 4. Parsea el HTML con DOMParser (sin navegar, sin recargar)
 * 5. Extrae los datos y los devuelve como JSON
 */
async function searchSite(siteName: string, query: string): Promise<any> {
  if (!siteName || !query) {
    throw new Error('Se necesita un sitio y una búsqueda. Ejemplo: "en Google Scholar busca iot"')
  }

  const structure = await resolveStructureBySiteName(siteName)

  if (!structure) {
    const allStructures = await getAllStructures()
    const names = allStructures.map(s => s.name).join(', ')
    throw new Error(
      `No se encontró estructura para "${siteName}". ` +
      `Sitios disponibles: ${names}. ` +
      `Navega al sitio y usa "crea la estructura" para agregarlo.`
    )
  }

  if (!structure.search_url) {
    throw new Error(
      `La estructura de "${structure.name}" no tiene URL de búsqueda configurada. ` +
      `Recrea la estructura navegando a una página de resultados del sitio.`
    )
  }

  // Construir URL de búsqueda
  const searchUrl = buildSearchUrl(structure, query)

  // Fetch invisible via background (cross-origin)
  const response = await chrome.runtime.sendMessage({
    type: 'FETCH_PAGE',
    url: searchUrl
  })

  if (!response || !response.success) {
    throw new Error(response?.error || 'Error al obtener la página en segundo plano')
  }

  // Parsear el HTML obtenido con DOMParser (sin navegar)
  const result = scrapeFromHtml(response.html, structure, query, searchUrl)

  return result
}

/**
 * Buscar en un sitio de forma VISIBLE:
 * 1. Obtiene la estructura del sitio desde chrome.storage
 * 2. Construye la URL de búsqueda con la query
 * 3. Pide al background abrir una nueva pestaña con esa URL
 */
async function searchSiteVisible(siteName: string, query: string): Promise<any> {
  if (!siteName || !query) {
    throw new Error('Se necesita un sitio y una búsqueda. Ejemplo: "en Google Scholar busca iot visible"')
  }

  const structure = await resolveStructureBySiteName(siteName)

  const fallbackUrl = buildFallbackSearchUrl(siteName, query)

  if (!structure && !fallbackUrl) {
    const allStructures = await getAllStructures()
    const names = allStructures.map(s => s.name).join(', ')
    throw new Error(
      `No se encontró estructura para "${siteName}". ` +
      `Sitios disponibles: ${names}. ` +
      `Navega al sitio y usa "crea la estructura" para agregarlo.`
    )
  }

  if (structure && !structure.search_url && !fallbackUrl) {
    throw new Error(
      `La estructura de "${structure.name}" no tiene URL de búsqueda configurada. ` +
      `Recrea la estructura navegando a una página de resultados del sitio.`
    )
  }

  const searchUrl = structure?.search_url ? buildSearchUrl(structure, query) : fallbackUrl!
  const sourceSite = structure?.name || normalizeSiteName(siteName)

  const response = await chrome.runtime.sendMessage({
    type: 'OPEN_TAB',
    url: searchUrl
  })

  if (!response || !response.success) {
    // Fallback: intentar abrir la pestaña desde el content script
    const win = window.open(searchUrl, '_blank', 'noopener,noreferrer')
    if (!win) {
      // Último fallback: navegar en la pestaña actual (evita bloqueo total).
      window.location.href = searchUrl
      return {
        action: 'searchSiteVisible',
        success: true,
        site: sourceSite,
        query,
        url: searchUrl,
        message: `No se pudo abrir una pestaña nueva; se abrió la búsqueda en la pestaña actual para continuar.`
      }
    }
    return {
      action: 'searchSiteVisible',
      success: true,
      site: sourceSite,
      query,
      url: searchUrl,
      message: `Se abrió una nueva pestaña con la búsqueda "${query}" en ${sourceSite}.`
    }
  }

  return {
    action: 'searchSiteVisible',
    success: true,
    site: sourceSite,
    query,
    url: response.url || searchUrl,
    message: `Se abrió una nueva pestaña con la búsqueda "${query}" en ${sourceSite}.`
  }
}

async function resolveStructureBySiteName(siteName: string) {
  const normalizedInput = normalizeSiteName(siteName)

  // Buscar la estructura por nombre (flexible)
  let structure = await getStructureByName(normalizedInput)

  // Si no encuentra exacto, buscar parcial
  if (!structure) {
    const allStructures = await getAllStructures()
    structure = allStructures.find(s =>
      s.name.toLowerCase().includes(normalizedInput.toLowerCase()) ||
      normalizedInput.toLowerCase().includes(s.name.toLowerCase())
    ) || null
  }

  return structure
}

function normalizeSiteName(siteName: string): string {
  const input = siteName.toLowerCase().trim()
  if (
    input.includes('scholar') ||
    input.includes('scgolar') ||
    input.includes('google escolar') ||
    input.includes('google scholar')
  ) {
    return 'Google Scholar'
  }
  return siteName
}

function buildFallbackSearchUrl(siteName: string, query: string): string | null {
  const normalized = normalizeSiteName(siteName).toLowerCase()
  const encoded = encodeURIComponent(query)

  if (normalized.includes('google scholar')) {
    return `https://scholar.google.com/scholar?q=${encoded}`
  }
  if (normalized.includes('springer')) {
    return `https://link.springer.com/search?query=${encoded}`
  }
  if (normalized.includes('dblp')) {
    return `https://dblp.org/search?q=${encoded}`
  }
  if (normalized.includes('amazon')) {
    return `https://www.amazon.com/s?k=${encoded}`
  }
  return null
}

async function highlightByCondition(
  property: string,
  operator: string = '>',
  value: any = 0
): Promise<any> {
  const structure = await resolveStructureByUrl(window.location.href)
  if (!structure) {
    throw new Error('No hay estructura para este sitio. Abre resultados del sitio y usa "crear estructura".')
  }

  const propSchema = findPropertySchema(structure, property)
  if (!propSchema) {
    const available = structure.properties_object_semantic_structure_schema
      .map(p => p.name_schema)
      .join(', ')
    throw new Error(
      `No se encontró la propiedad "${property}" en este sitio. Propiedades disponibles: ${available}`
    )
  }

  const containers = Array.from(document.querySelectorAll(structure.result_container_selector)) as HTMLElement[]
  if (containers.length === 0) {
    throw new Error(`No se encontraron resultados con selector "${structure.result_container_selector}".`)
  }

  clearHighlights()

  let highlighted = 0
  containers.forEach((container) => {
    const extracted = extractValueBySchema(
      container,
      propSchema.selector_css_schema,
      propSchema.type_schema,
      propSchema.name_schema
    )
    if (matchesCondition(extracted, operator, value)) {
      applyHighlight(container)
      highlighted++
    }
  })

  return {
    action: 'highlightByCondition',
    success: true,
    property: propSchema.name_schema,
    operator,
    value,
    total: containers.length,
    highlighted,
    message: `Se resaltaron ${highlighted} de ${containers.length} resultados donde ${propSchema.name_schema} ${operator} ${value}.`
  }
}

async function resolveStructureByUrl(url: string): Promise<SiteStructure | null> {
  try {
    const hostname = new URL(url).hostname
    const allStructures = await getAllStructures()
    return allStructures.find(s => {
      try {
        const siteHost = new URL(s.url).hostname
        return hostname.includes(siteHost) || siteHost.includes(hostname)
      } catch {
        return false
      }
    }) || null
  } catch {
    return null
  }
}

function findPropertySchema(structure: SiteStructure, requested: string) {
  const normalizedRequested = normalizeKey(requested)
  const aliases: Record<string, string[]> = {
    citations: ['citations', 'citation', 'citas', 'citedby', 'cited_by'],
    authors: ['authors', 'author', 'autores', 'autor'],
    date: ['date', 'year', 'fecha', 'anio', 'año'],
    title: ['title', 'titulo', 'título', 'name', 'nombre']
  }

  const direct = structure.properties_object_semantic_structure_schema.find(
    p => normalizeKey(p.name_schema) === normalizedRequested
  )
  if (direct) return direct

  for (const prop of structure.properties_object_semantic_structure_schema) {
    const propName = normalizeKey(prop.name_schema)
    for (const aliasList of Object.values(aliases)) {
      if (aliasList.includes(normalizedRequested) && aliasList.includes(propName)) {
        return prop
      }
    }
  }

  return structure.properties_object_semantic_structure_schema.find(
    p =>
      normalizeKey(p.name_schema).includes(normalizedRequested) ||
      normalizedRequested.includes(normalizeKey(p.name_schema))
  ) || null
}

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function extractValueBySchema(
  element: HTMLElement,
  selector: string,
  type: string,
  propertyName?: string
): any {
  const normalizedProp = normalizeKey(propertyName || '')
  const isCitationsProp = ['citation', 'citations', 'citas', 'citedby', 'cited_by'].some(
    k => normalizedProp.includes(k)
  )

  if (isCitationsProp) {
    // En Scholar suele haber varios enlaces; buscamos el mayor número encontrado.
    const candidates = selector
      ? Array.from(element.querySelectorAll(selector))
      : Array.from(element.querySelectorAll('a, span, div'))
    const values = candidates
      .map((n) => extractNumber((n as HTMLElement).textContent || ''))
      .filter((n) => Number.isFinite(n))
    if (values.length > 0) return Math.max(...values)

    const fallbackCitations = extractNumberFromCitationText(element.textContent || '')
    if (Number.isFinite(fallbackCitations)) return fallbackCitations
  }

  if (!selector) return ''
  const target = element.querySelector(selector) as HTMLElement | null
  if (!target) return ''

  if (type === 'url') {
    return (target as HTMLAnchorElement).getAttribute('href') || target.querySelector('a')?.getAttribute('href') || ''
  }

  if (type === 'number') {
    const n = extractNumber(target.textContent || '')
    return Number.isFinite(n) ? n : 0
  }

  if (type === 'array') {
    return Array.from(element.querySelectorAll(selector))
      .map(el => el.textContent?.trim() || '')
      .filter(Boolean)
  }

  if (type === 'html') {
    return target.innerHTML || ''
  }

  return target.textContent?.trim() || ''
}

function extractNumber(text: string): number {
  const cleaned = text.replace(/\s+/g, ' ')
  const match = cleaned.match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return NaN
  return parseFloat(match[0].replace(/,/g, ''))
}

function extractNumberFromCitationText(text: string): number {
  // Ejemplos: "Citado por 123", "Cited by 87"
  const lower = text.toLowerCase()
  const match = lower.match(/(?:citado\s+por|cited\s+by)\s+(\d+)/)
  if (!match) return NaN
  return parseFloat(match[1])
}

function matchesCondition(actual: any, operator: string, expected: any): boolean {
  const op = (operator || '>').trim()
  const actualNum = typeof actual === 'number' ? actual : extractNumber(String(actual))
  const expectedNum = typeof expected === 'number' ? expected : extractNumber(String(expected))
  const hasNumbers = Number.isFinite(actualNum) && Number.isFinite(expectedNum)

  if (op === 'contains') {
    return String(actual).toLowerCase().includes(String(expected).toLowerCase())
  }

  if (hasNumbers) {
    if (op === '>') return actualNum > expectedNum
    if (op === '>=') return actualNum >= expectedNum
    if (op === '<') return actualNum < expectedNum
    if (op === '<=') return actualNum <= expectedNum
    if (op === '!=' || op === '<>') return actualNum !== expectedNum
    return actualNum === expectedNum
  }

  if (op === '!=' || op === '<>') return String(actual) !== String(expected)
  return String(actual) === String(expected)
}

function clearHighlights() {
  document.querySelectorAll('[data-ai-highlight="1"]').forEach((node) => {
    const el = node as HTMLElement
    el.style.outline = ''
    el.style.background = ''
    el.style.boxShadow = ''
    el.style.borderRadius = ''
    el.removeAttribute('data-ai-highlight')
  })
}

function applyHighlight(element: HTMLElement) {
  element.setAttribute('data-ai-highlight', '1')
  element.style.outline = '2px solid #f59e0b'
  element.style.background = 'rgba(245, 158, 11, 0.12)'
  element.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.2) inset'
  element.style.borderRadius = '8px'
}

function changeColor(color: string | null) {
  const h1Elements = document.querySelectorAll('h1')
  const h2Elements = document.querySelectorAll('h2')
  const h3Elements = document.querySelectorAll('h3')

  if (color === null) {
    h1Elements.forEach(h => (h as HTMLElement).style.color = '')
    h2Elements.forEach(h => (h as HTMLElement).style.color = '')
    h3Elements.forEach(h => (h as HTMLElement).style.color = '')
  } else {
    h1Elements.forEach(h => (h as HTMLElement).style.color = color)
    h2Elements.forEach(h => (h as HTMLElement).style.color = color)
    h3Elements.forEach(h => (h as HTMLElement).style.color = color)
  }

  return { success: true, color, action: 'changeColor' }
}

function getTitles() {
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
    url: window.location.href,
    action: 'getTitles'
  }
}
