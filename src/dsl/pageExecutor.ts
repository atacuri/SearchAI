// src/dsl/pageExecutor.ts
// Executor que trabaja directamente en el DOM de la página
// searchSite: fetch invisible via background + parsea con DOMParser
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

    case 'createStructure':
      return await createStructure()

    case 'listStructures':
      return await listStructures()

    case 'deleteStructure':
      return await removeStructure(command.params.name)

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
 * Analiza la página actual con IA para crear la estructura de scraping.
 * 1. Simplifica el HTML de la página
 * 2. Envía al background → IA analiza y devuelve selectores CSS
 * 3. Guarda la estructura en chrome.storage.local
 * 4. Retorna la estructura creada
 */
async function createStructure(): Promise<CreateStructureResult> {
  // Verificar que la IA esté configurada
  const aiConfig = await getAIConfig()
  console.log('aiConfig', aiConfig)
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

  // Validar que la IA devolvió una estructura válida
  if (!aiStructure || !aiStructure.selectors || !aiStructure.selectors.resultContainer) {
    throw new Error(
      'La IA no pudo identificar la estructura de resultados en esta página. ' +
      'Asegúrate de estar en una página con resultados de búsqueda visibles.'
    )
  }

  // Construir la estructura completa
  const structure: SiteStructure = {
    name: aiStructure.name || extractSiteName(currentUrl),
    url: aiStructure.url || new URL(currentUrl).origin,
    domain: aiStructure.domain || 'general',
    search_url: aiStructure.search_url || '',
    search_params: aiStructure.search_params || {},
    selectors: {
      resultContainer: aiStructure.selectors.resultContainer || '',
      title: aiStructure.selectors.title || '',
      titleLink: aiStructure.selectors.titleLink || '',
      authors: aiStructure.selectors.authors || '',
      authorLinks: aiStructure.selectors.authorLinks || '',
      date: aiStructure.selectors.date || '',
      abstract: aiStructure.selectors.abstract || '',
      citations: aiStructure.selectors.citations || ''
    },
    semantic_structure: aiStructure.semantic_structure || { type: 'General' }
  }

  // Guardar la estructura en chrome.storage.local
  await saveStructure(structure)

  // Verificar cuántos resultados encuentra con los selectores
  const testResults = document.querySelectorAll(structure.selectors.resultContainer)

  return {
    action: 'createStructure',
    success: true,
    structure,
    message: `Estructura creada para "${structure.name}". ` +
      `Se detectaron ${testResults.length} resultados en la página. ` +
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

  // Buscar la estructura por nombre (flexible)
  let structure = await getStructureByName(siteName)

  // Si no encuentra exacto, buscar parcial
  if (!structure) {
    const allStructures = await getAllStructures()
    structure = allStructures.find(s =>
      s.name.toLowerCase().includes(siteName.toLowerCase()) ||
      siteName.toLowerCase().includes(s.name.toLowerCase())
    ) || null
  }

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
