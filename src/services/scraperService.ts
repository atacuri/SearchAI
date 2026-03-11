// src/services/scraperService.ts
// Servicio de scraping 100% GENÉRICO — usa propiedades dinámicas de la estructura
// Ya NO hay tipos fijos (ScrapedArticle, etc.) — todo es dinámico basado en PropertySchema
// Funciona con CUALQUIER sitio: académico, e-commerce, noticias, etc.

import type { ScrapedItem, ScrapeResult, SiteStructure, PropertySchema } from '../types'
import { findStructureForHostname, getAllStructures } from './structureStorage'

// ============ Scraping de la página actual (DOM vivo) ============

/**
 * Detecta si la página actual es un sitio con estructura guardada
 */
export async function detectSiteStructure(): Promise<SiteStructure | null> {
  const hostname = window.location.hostname
  return await findStructureForHostname(hostname)
}

/**
 * Scrapea los resultados de la página actual usando propiedades dinámicas
 */
export async function scrapeCurrentPage(): Promise<ScrapeResult> {
  const structure = await detectSiteStructure()

  if (!structure) {
    const allStructures = await getAllStructures()
    const siteNames = allStructures.map(s => s.name).join(', ')
    throw new Error(
      `No hay estructura de scraping para esta página. ` +
      `Sitios configurados: ${siteNames}. ` +
      `Usa "crea la estructura" en una página de resultados para agregarla.`
    )
  }

  const query = extractQueryFromUrl(window.location.href, structure)
  return scrapeDocument(document, structure, query, window.location.href)
}

// ============ Scraping desde HTML string (invisible, sin navegar) ============

/**
 * Scrapea resultados desde un HTML string usando propiedades dinámicas.
 * Usa DOMParser para crear un DOM virtual — no afecta la página del usuario.
 */
export function scrapeFromHtml(
  html: string,
  structure: SiteStructure,
  query: string,
  url: string
): ScrapeResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return scrapeDocument(doc, structure, query, url)
}

// ============ Scraper GENÉRICO basado en propiedades dinámicas ============

/**
 * Extrae resultados de CUALQUIER sitio usando las propiedades definidas en la estructura.
 * Cada propiedad tiene un tipo (string, url, date, number, array) y un selector CSS.
 * Funciona tanto con DOM vivo como con DOMParser.
 */
function scrapeDocument(
  doc: Document,
  structure: SiteStructure,
  query: string,
  url: string
): ScrapeResult {
  const { result_container_selector, properties_object_semantic_structure_schema: properties } = structure

  if (!result_container_selector) {
    throw new Error(
      `La estructura de "${structure.name}" no tiene selector de contenedor. ` +
      `Navega al sitio y usa "crea la estructura" para generarla con IA.`
    )
  }

  if (!properties || properties.length === 0) {
    throw new Error(
      `La estructura de "${structure.name}" no tiene propiedades definidas. ` +
      `Recrea la estructura con "crea la estructura".`
    )
  }

  // Buscar todos los contenedores de resultados
  let resultElements = Array.from(doc.querySelectorAll(result_container_selector)) as HTMLElement[]

  // Fallbacks específicos para Springer cuando el selector generado por IA queda obsoleto.
  if (resultElements.length === 0 && isSpringerStructure(structure, url)) {
    const springerFallbackSelectors = [
      'li.app-card-open',
      'article.app-card-open',
      'ol#results-list li',
      '[data-test="search-result"]',
      '.app-search-layout__result'
    ]
    for (const sel of springerFallbackSelectors) {
      const candidates = Array.from(doc.querySelectorAll(sel)) as HTMLElement[]
      if (candidates.length > 0) {
        resultElements = candidates
        break
      }
    }
  }

  // Fallback heurístico: detecta resultados por enlaces típicos de contenido Springer.
  if (resultElements.length === 0 && isSpringerSearchUrl(url)) {
    const inferred = inferSpringerResultContainers(doc)
    if (inferred.length > 0) {
      resultElements = inferred
    }
  }

  if (resultElements.length === 0) {
    if (isLikelyChallengePage(doc)) {
      throw new Error(
        `El sitio devolvió una página de verificación/bloqueo (challenge) en lugar de resultados. ` +
        `Intenta la búsqueda en modo visible para continuar.`
      )
    }
    throw new Error(
      `No se encontraron resultados con el selector "${result_container_selector}" ` +
      `en ${structure.name}. Puede que la página esté vacía o haya cambiado su estructura.`
    )
  }

  const items: ScrapedItem[] = []
  const propertyNames = properties.map(p => p.name_schema)

  resultElements.forEach((element) => {
    try {
      const item = extractItemGeneric(element, properties)
      // Solo agregar si tiene al menos una propiedad con valor
      const hasContent = Object.values(item).some(v => v !== '' && v !== null && v !== undefined)
      if (hasContent) {
        items.push(item)
      }
    } catch (err) {
      console.warn('[Scraper] Error extrayendo resultado:', err)
    }
  })

  return {
    source: structure.name,
    domain: structure.domain,
    url,
    query,
    totalResults: items.length,
    results: items,
    action: 'scrapeResults',
    semantic_type: structure.object_semantic_structure_schema.type,
    properties: propertyNames
  }
}

function isSpringerStructure(structure: SiteStructure, url: string): boolean {
  const name = structure.name.toLowerCase()
  const baseUrl = structure.url.toLowerCase()
  const currentUrl = url.toLowerCase()
  return (
    name.includes('springer') ||
    baseUrl.includes('springer.com') ||
    currentUrl.includes('springer.com')
  )
}

function isSpringerSearchUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('link.springer.com/search')
}

function inferSpringerResultContainers(doc: Document): HTMLElement[] {
  const linkSelector = [
    'a[href*="/article/"]',
    'a[href*="/chapter/"]',
    'a[href*="/book/"]',
    'a[href*="/referenceworkentry/"]'
  ].join(',')

  const candidates = Array.from(doc.querySelectorAll('li, article, div')) as HTMLElement[]
  const filtered = candidates.filter((el) => {
    const contentLink = el.querySelector(linkSelector)
    if (!contentLink) return false
    const hasTitle = !!el.querySelector('h2, h3, [data-test*="title"]')
    const textLen = (el.textContent || '').trim().length
    return hasTitle && textLen > 30
  })

  if (filtered.length === 0) return []

  // Evitar contenedores anidados para quedarnos con "cards" de nivel resultado.
  const set = new Set(filtered)
  const topLevel = filtered.filter((el) => {
    let parent = el.parentElement
    while (parent) {
      if (set.has(parent as HTMLElement)) return false
      parent = parent.parentElement
    }
    return true
  })

  return topLevel.slice(0, 200)
}

function isLikelyChallengePage(doc: Document): boolean {
  const text = (doc.body?.textContent || '').toLowerCase()
  return (
    text.includes('client challenge') ||
    text.includes("required part of this site couldn't load") ||
    text.includes('required part of this site couldn’t load') ||
    text.includes('verify you are human') ||
    text.includes('captcha')
  )
}

// ============ Extractor genérico de un resultado individual ============

/**
 * Extrae TODAS las propiedades de un resultado usando los selectores y tipos definidos.
 * El tipo de cada propiedad determina CÓMO se extrae el valor:
 *   - "string"  → textContent
 *   - "url"     → href del <a>
 *   - "number"  → número del textContent
 *   - "date"    → patrón de fecha/año
 *   - "array"   → múltiples matches como array
 *   - "html"    → innerHTML
 */
function extractItemGeneric(
  element: HTMLElement,
  properties: PropertySchema[]
): ScrapedItem {
  const item: ScrapedItem = {}

  for (const prop of properties) {
    const { type_schema, name_schema, selector_css_schema } = prop

    try {
      const key = normalizePropertyKey(name_schema)
      if (isCitationKey(key)) {
        const citationValue = extractCitationForProperty(element, selector_css_schema)
        if (Number.isFinite(citationValue)) {
          item[name_schema] = citationValue
          continue
        }
      }

      const baseValue = selector_css_schema
        ? extractByType(element, selector_css_schema, type_schema)
        : ''
      item[name_schema] = withSemanticFallback(element, name_schema, type_schema, baseValue)
    } catch {
      item[name_schema] = withSemanticFallback(element, name_schema, type_schema, '')
    }
  }

  return item
}

/**
 * Extrae un valor según su tipo del elemento usando el selector CSS
 */
function extractByType(
  element: HTMLElement,
  selector: string,
  type: string
): any {
  switch (type) {
    case 'string': {
      const el = element.querySelector(selector)
      return el?.textContent?.trim() || ''
    }

    case 'url': {
      // Buscar el <a> con el selector y extraer href
      const linkEl = element.querySelector(selector) as HTMLAnchorElement | null
      if (linkEl) {
        return linkEl.getAttribute('href') || ''
      }
      // Fallback: buscar un <a> dentro del elemento que matchea
      const el = element.querySelector(selector)
      const innerLink = el?.querySelector('a') as HTMLAnchorElement | null
      return innerLink?.getAttribute('href') || ''
    }

    case 'number': {
      const el = element.querySelector(selector)
      const text = el?.textContent?.trim() || ''
      // Extraer el primer número encontrado
      const match = text.match(/[\d,]+\.?\d*/)
      if (match) {
        return parseFloat(match[0].replace(/,/g, ''))
      }
      return 0
    }

    case 'date': {
      const el = element.querySelector(selector)
      const text = el?.textContent || ''
      // Buscar año (4 dígitos entre 1900-2099)
      const yearMatch = text.match(/\b(19|20)\d{2}\b/)
      if (yearMatch) return yearMatch[0]
      // Buscar formato fecha más completo
      const dateMatch = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/)
      if (dateMatch) return dateMatch[0]
      return ''
    }

    case 'array': {
      const els = element.querySelectorAll(selector)
      const items: string[] = []
      els.forEach(el => {
        const text = el.textContent?.trim()
        if (text) items.push(text)
      })
      return items
    }

    case 'html': {
      const el = element.querySelector(selector)
      return el?.innerHTML?.trim() || ''
    }

    default:
      // Fallback: tratar como string
      const el = element.querySelector(selector)
      return el?.textContent?.trim() || ''
  }
}

function withSemanticFallback(
  element: HTMLElement,
  propertyName: string,
  type: string,
  currentValue: any
): any {
  if (hasUsableValue(currentValue)) return currentValue

  const key = normalizePropertyKey(propertyName)

  if (isCitationKey(key)) {
    const citations = extractCitationForProperty(element, '')
    if (Number.isFinite(citations)) return citations
  }

  if (key.includes('title') || key.includes('name') || key.includes('titulo')) {
    const titleEl = element.querySelector('h1, h2, h3, [data-test*="title"], a[href*="/article/"], a[href*="/chapter/"]')
    const text = titleEl?.textContent?.trim() || ''
    return text || currentValue
  }

  if (key.includes('url') || key.includes('link')) {
    const link = element.querySelector('a[href*="/article/"], a[href*="/chapter/"], a[href*="/book/"], a[href]') as HTMLAnchorElement | null
    const href = link?.getAttribute('href') || ''
    return href || currentValue
  }

  if (key.includes('author') || key.includes('autores')) {
    const authorEl = element.querySelector('.c-list-authors, [data-test*="author"], .authors')
    return authorEl?.textContent?.trim() || currentValue
  }

  if (key.includes('abstract') || key.includes('summary') || key.includes('snippet')) {
    const summaryEl = element.querySelector('p, [data-test*="snippet"], .c-card__summary')
    return summaryEl?.textContent?.trim() || currentValue
  }

  if (key.includes('date') || key.includes('year') || key.includes('anio') || key.includes('año')) {
    const text = element.textContent || ''
    const year = text.match(/\b(19|20)\d{2}\b/)
    return year?.[0] || currentValue
  }

  if (key.includes('doi')) {
    const doiLink = element.querySelector('a[href*="doi.org"], a[href*="/doi/"]') as HTMLAnchorElement | null
    const href = doiLink?.getAttribute('href') || ''
    if (href) return href
    const text = element.textContent || ''
    const doiText = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i)
    return doiText?.[0] || currentValue
  }

  if (type === 'number') {
    const n = extractNumberFromText(element.textContent || '')
    return Number.isFinite(n) ? n : currentValue
  }

  return currentValue
}

function hasUsableValue(value: any): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== '' && value !== null && value !== undefined
}

function normalizePropertyKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function extractNumberFromText(text: string): number {
  const match = text.match(/-?\d+(?:[.,]\d+)?/)
  if (!match) return NaN
  return parseFloat(match[0].replace(/,/g, ''))
}

function isCitationKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes('citation') ||
    normalizedKey.includes('citas') ||
    normalizedKey.includes('citedby') ||
    normalizedKey.includes('numerodecitas') ||
    normalizedKey.includes('numerocitas')
  )
}

function extractCitationForProperty(element: HTMLElement, selector: string): number {
  const nodes = selector
    ? Array.from(element.querySelectorAll(selector))
    : Array.from(element.querySelectorAll('a, span, div'))

  let best = NaN
  for (const node of nodes) {
    const text = (node as HTMLElement).textContent || ''
    const byMatch = text.match(/(?:cited\s+by|citado\s+por)\s*(\d+)/i)
    if (byMatch?.[1]) {
      const n = parseInt(byMatch[1], 10)
      if (Number.isFinite(n) && (!Number.isFinite(best) || n > best)) best = n
    }
  }

  if (Number.isFinite(best)) return best

  // Fallback: revisar texto completo del item por patrón explícito de citas.
  const itemText = element.textContent || ''
  const itemMatch = itemText.match(/(?:cited\s+by|citado\s+por)\s*(\d+)/i)
  if (itemMatch?.[1]) {
    const n = parseInt(itemMatch[1], 10)
    if (Number.isFinite(n)) return n
  }

  return NaN
}

// ============ Utilidades ============

/**
 * Extrae la query de búsqueda de la URL usando los search_params de la estructura
 */
function extractQueryFromUrl(url: string, structure: SiteStructure): string {
  try {
    const urlObj = new URL(url)
    const params = urlObj.searchParams

    // Intentar con los parámetros definidos en la estructura
    for (const paramName of Object.keys(structure.search_params)) {
      const value = params.get(paramName)
      if (value) return value
    }

    // Fallback a parámetros comunes
    return params.get('q') || params.get('query') || params.get('search') || 
           params.get('keyword') || params.get('term') || ''
  } catch {
    return ''
  }
}

// ============ Simplificador de HTML para análisis por IA ============

/**
 * Simplifica el HTML de la página para enviarlo a la IA.
 * Elimina scripts, styles, SVG, comentarios y exceso de whitespace.
 * Conserva atributos clave para identificar selectores CSS (class, id, href, data-*, role, aria-label).
 * Limita el tamaño para no exceder tokens del modelo.
 */
export function simplifyHtmlForAI(doc: Document = document): string {
  // Clonar el body para no modificar la página real
  const clone = doc.body.cloneNode(true) as HTMLElement

  // Eliminar elementos que no aportan estructura
  const removeSelectors = ['script', 'style', 'svg', 'noscript', 'iframe', 'video', 'audio', 'canvas', 'link', 'meta']
  removeSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove())
  })

  // Eliminar comentarios HTML
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT)
  const comments: Comment[] = []
  while (walker.nextNode()) {
    comments.push(walker.currentNode as Comment)
  }
  comments.forEach(c => c.parentNode?.removeChild(c))

  // Eliminar atributos innecesarios — CONSERVAR los que sirven como selectores CSS
  const keepAttrs = ['class', 'id', 'href', 'role', 'aria-label', 'alt', 'title']
  const allElements = clone.querySelectorAll('*')
  allElements.forEach(el => {
    const attrs = Array.from(el.attributes)
    attrs.forEach(attr => {
      const name = attr.name.toLowerCase()
      // Conservar: class, id, href, role, aria-label, alt, title y TODOS los data-*
      const keep = keepAttrs.includes(name) || name.startsWith('data-')
      if (!keep) {
        el.removeAttribute(attr.name)
      }
    })
  })

  // Reemplazar <img> con placeholder que conserve alt (útil para detectar propiedades)
  clone.querySelectorAll('img').forEach(img => {
    const alt = img.getAttribute('alt') || ''
    if (alt) {
      const span = doc.createElement('span')
      span.setAttribute('class', img.getAttribute('class') || '')
      span.textContent = `[img: ${alt}]`
      img.replaceWith(span)
    } else {
      img.remove()
    }
  })

  let html = clone.innerHTML
  
  // Limpiar whitespace excesivo
  html = html.replace(/\s+/g, ' ')
  html = html.replace(/>\s+</g, '><')

  // Limitar a ~12000 caracteres para sitios complejos como Amazon
  const MAX_LENGTH = 12000
  if (html.length > MAX_LENGTH) {
    html = html.substring(0, MAX_LENGTH) + '\n<!-- ... HTML truncado ... -->'
  }

  return html
}
