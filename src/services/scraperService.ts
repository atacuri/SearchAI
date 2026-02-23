// src/services/scraperService.ts
// Servicio de scraping GENÉRICO — usa selectores CSS de la estructura del sitio
// Ya NO hay scrapers hardcoded para sitios específicos.
// La IA genera los selectores al analizar la página → se guardan → se reusan.

import type { ScrapedArticle, ScrapedAuthor, ScrapeResult, SiteStructure } from '../types'
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
 * Scrapea los resultados de la página actual usando selectores dinámicos
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
 * Scrapea resultados desde un HTML string usando selectores dinámicos.
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

// ============ Scraper GENÉRICO basado en selectores CSS ============

/**
 * Extrae artículos/resultados de CUALQUIER sitio usando los selectores CSS
 * guardados en la estructura. Funciona tanto con DOM vivo como con DOMParser.
 */
function scrapeDocument(
  doc: Document,
  structure: SiteStructure,
  query: string,
  url: string
): ScrapeResult {
  const { selectors } = structure

  if (!selectors || !selectors.resultContainer) {
    throw new Error(
      `La estructura de "${structure.name}" no tiene selectores CSS. ` +
      `Navega al sitio y usa "crea la estructura" para generarlos con IA.`
    )
  }

  // Buscar todos los contenedores de resultados
  const resultElements = doc.querySelectorAll(selectors.resultContainer)

  if (resultElements.length === 0) {
    throw new Error(
      `No se encontraron resultados con el selector "${selectors.resultContainer}" ` +
      `en ${structure.name}. Puede que la página esté vacía o haya cambiado su estructura.`
    )
  }

  const articles: ScrapedArticle[] = []

  resultElements.forEach((element) => {
    try {
      const article = extractArticleGeneric(element as HTMLElement, selectors)
      if (article.title) {
        articles.push(article)
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
    totalResults: articles.length,
    results: articles,
    action: 'scrapeResults',
    semantic_type: structure.semantic_structure.type
  }
}

// ============ Extractor genérico de un resultado individual ============

function extractArticleGeneric(
  element: HTMLElement,
  selectors: SiteStructure['selectors']
): ScrapedArticle {
  // --- Título ---
  let title = ''
  let articleUrl = ''

  if (selectors.titleLink) {
    const linkEl = element.querySelector(selectors.titleLink) as HTMLAnchorElement | null
    if (linkEl) {
      title = linkEl.textContent?.trim() || ''
      articleUrl = linkEl.getAttribute('href') || ''
    }
  }
  if (!title && selectors.title) {
    const titleEl = element.querySelector(selectors.title)
    title = titleEl?.textContent?.trim() || ''
    // Intentar extraer link del título si no se obtuvo antes
    if (!articleUrl) {
      const linkInTitle = titleEl?.querySelector('a') as HTMLAnchorElement | null
      articleUrl = linkInTitle?.getAttribute('href') || ''
    }
  }

  // --- Autores ---
  const authors: ScrapedAuthor[] = []

  if (selectors.authorLinks) {
    const authorLinkEls = element.querySelectorAll(selectors.authorLinks)
    authorLinkEls.forEach((link) => {
      const name = link.textContent?.trim() || ''
      const href = (link as HTMLAnchorElement).getAttribute('href') || ''
      if (name) {
        authors.push({ name, url: href })
      }
    })
  }

  // Si no encontramos links de autores, intentar con el contenedor de autores
  if (authors.length === 0 && selectors.authors) {
    const authorsEl = element.querySelector(selectors.authors)
    if (authorsEl) {
      const authorsText = authorsEl.textContent?.trim() || ''
      // Dividir por comas, puntos y coma, o " - "
      const parts = authorsText.split(/[,;]|\s-\s/).map(a => a.trim()).filter(a => a)
      // Tomar solo la primera parte (antes de info de revista/fecha)
      const authorPart = authorsText.split(' - ')[0] || authorsText
      const names = authorPart.split(/[,;]/).map(a => a.trim()).filter(a => a && a.length < 50)
      names.forEach(name => {
        const cleanName = name.replace(/…$/, '').replace(/\.\.\.$/, '').trim()
        if (cleanName && cleanName.length > 1) {
          authors.push({ name: cleanName, url: '' })
        }
      })
    }
  }

  // --- Fecha/Año ---
  let date = ''
  if (selectors.date) {
    const dateEl = element.querySelector(selectors.date)
    if (dateEl) {
      const dateText = dateEl.textContent || ''
      // Buscar un año (4 dígitos entre 1900-2099)
      const yearMatch = dateText.match(/\b(19|20)\d{2}\b/)
      if (yearMatch) {
        date = yearMatch[0]
      }
    }
  }

  // --- Abstract/Snippet ---
  let abstract = ''
  if (selectors.abstract) {
    const abstractEl = element.querySelector(selectors.abstract)
    abstract = abstractEl?.textContent?.trim() || ''
  }

  // --- Citaciones ---
  let citations = '0'
  if (selectors.citations) {
    const citationEls = element.querySelectorAll(selectors.citations)
    for (const el of Array.from(citationEls)) {
      const text = el.textContent?.trim() || ''
      // Buscar patrones comunes: "Cited by 42", "Citado por 42", "42 citations"
      const match = text.match(/(?:Cited by|Citado por|Citations?:?)\s*(\d+)/i)
      if (match) {
        citations = match[1]
        break
      }
      // Patrón alternativo: solo un número
      const numMatch = text.match(/^(\d+)\s*(?:citations?|citas?)?$/i)
      if (numMatch) {
        citations = numMatch[1]
        break
      }
    }
  }

  return {
    title,
    url: articleUrl,
    date,
    authors,
    citations,
    abstract
  }
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
 * Elimina scripts, styles, SVG, imágenes, comentarios y exceso de whitespace.
 * Limita el tamaño para no exceder tokens del modelo.
 */
export function simplifyHtmlForAI(doc: Document = document): string {
  // Clonar el body para no modificar la página real
  const clone = doc.body.cloneNode(true) as HTMLElement

  // Eliminar elementos que no aportan estructura
  const removeSelectors = ['script', 'style', 'svg', 'img', 'noscript', 'iframe', 'video', 'audio', 'canvas', 'link', 'meta']
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

  // Eliminar atributos innecesarios (dejar solo class, id, href, data-*)
  const allElements = clone.querySelectorAll('*')
  allElements.forEach(el => {
    const attrs = Array.from(el.attributes)
    attrs.forEach(attr => {
      const name = attr.name.toLowerCase()
      if (!['class', 'id', 'href', 'data-id'].includes(name)) {
        el.removeAttribute(attr.name)
      }
    })
  })

  let html = clone.innerHTML
  
  // Limpiar whitespace excesivo
  html = html.replace(/\s+/g, ' ')
  html = html.replace(/>\s+</g, '><')

  // Limitar a ~8000 caracteres para no exceder tokens
  const MAX_LENGTH = 8000
  if (html.length > MAX_LENGTH) {
    html = html.substring(0, MAX_LENGTH) + '\n<!-- ... HTML truncado ... -->'
  }

  return html
}
