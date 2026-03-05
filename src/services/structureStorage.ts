// src/services/structureStorage.ts
// Servicio para almacenar y gestionar estructuras de sitios en chrome.storage.local
// Las estructuras ahora usan PROPIEDADES DINÁMICAS generadas por IA

import type { SiteStructure } from '../types'

const STRUCTURES_KEY = 'site_structures'

// Estructura por defecto de Google Scholar (con propiedades dinámicas)
const DEFAULT_STRUCTURES: SiteStructure[] = [
  {
    name: "Google Scholar",
    url: "https://scholar.google.com",
    domain: "academic",
    search_url: "https://scholar.google.com/scholar?q={query}",
    search_params: { q: "query" },
    result_container_selector: ".gs_r.gs_or.gs_scl",
    object_semantic_structure_schema: {
      type: "ArticleScientific"
    },
    properties_object_semantic_structure_schema: [
      { type_schema: "string", name_schema: "title",     selector_css_schema: ".gs_rt" },
      { type_schema: "url",    name_schema: "url",        selector_css_schema: ".gs_rt a" },
      { type_schema: "string", name_schema: "authors",    selector_css_schema: ".gs_a" },
      { type_schema: "date",   name_schema: "date",       selector_css_schema: ".gs_a" },
      { type_schema: "string", name_schema: "abstract",   selector_css_schema: ".gs_rs" },
      { type_schema: "string", name_schema: "citations",  selector_css_schema: ".gs_fl.gs_flb a" }
    ]
  }
]

// ============ CRUD de Estructuras ============

/**
 * Obtener todas las estructuras almacenadas
 */
export async function getAllStructures(): Promise<SiteStructure[]> {
  try {
    const result = await chrome.storage.local.get(STRUCTURES_KEY)
    const stored = result[STRUCTURES_KEY]
    if (!stored || !Array.isArray(stored) || stored.length === 0) {
      await chrome.storage.local.set({ [STRUCTURES_KEY]: DEFAULT_STRUCTURES })
      return DEFAULT_STRUCTURES
    }
    // Migrar estructuras del formato viejo al nuevo si es necesario
    const migrated = (stored as any[]).map(migrateStructure)
    // Si hubo migración, guardar
    const needsSave = (stored as any[]).some(s => s.selectors || s.semantic_structure)
    if (needsSave) {
      await chrome.storage.local.set({ [STRUCTURES_KEY]: migrated })
    }
    return migrated
  } catch {
    return DEFAULT_STRUCTURES
  }
}

/**
 * Migra una estructura del formato viejo (selectors) al nuevo (properties)
 */
function migrateStructure(s: any): SiteStructure {
  // Si ya tiene el nuevo formato, devolverla tal cual
  if (s.result_container_selector && s.object_semantic_structure_schema && s.properties_object_semantic_structure_schema) {
    return s as SiteStructure
  }

  // Migrar formato viejo con "selectors" al nuevo con "properties"
  if (s.selectors) {
    const properties: any[] = []
    const sel = s.selectors

    if (sel.title)       properties.push({ type_schema: "string", name_schema: "title",     selector_css_schema: sel.title })
    if (sel.titleLink)   properties.push({ type_schema: "url",    name_schema: "url",        selector_css_schema: sel.titleLink })
    if (sel.authors)     properties.push({ type_schema: "string", name_schema: "authors",    selector_css_schema: sel.authors })
    if (sel.date)        properties.push({ type_schema: "date",   name_schema: "date",       selector_css_schema: sel.date })
    if (sel.abstract)    properties.push({ type_schema: "string", name_schema: "abstract",   selector_css_schema: sel.abstract })
    if (sel.citations)   properties.push({ type_schema: "string", name_schema: "citations",  selector_css_schema: sel.citations })

    return {
      name: s.name || 'Sitio migrado',
      url: s.url || '',
      domain: s.domain || 'general',
      search_url: s.search_url || '',
      search_params: s.search_params || {},
      result_container_selector: sel.resultContainer || '',
      object_semantic_structure_schema: s.semantic_structure || { type: 'General' },
      properties_object_semantic_structure_schema: properties
    }
  }

  // Estructura irreconocible → devolver con valores por defecto
  return {
    name: s.name || 'Sitio desconocido',
    url: s.url || '',
    domain: s.domain || 'general',
    search_url: s.search_url || '',
    search_params: s.search_params || {},
    result_container_selector: '',
    object_semantic_structure_schema: s.semantic_structure || s.object_semantic_structure_schema || { type: 'General' },
    properties_object_semantic_structure_schema: s.properties_object_semantic_structure_schema || []
  }
}

/**
 * Obtener una estructura por nombre del sitio
 */
export async function getStructureByName(name: string): Promise<SiteStructure | null> {
  const structures = await getAllStructures()
  return structures.find(
    s => s.name.toLowerCase() === name.toLowerCase()
  ) || null
}

/**
 * Buscar estructura que coincida con un hostname
 */
export async function findStructureForHostname(hostname: string): Promise<SiteStructure | null> {
  const structures = await getAllStructures()
  return structures.find(s => {
    try {
      const siteHost = new URL(s.url).hostname
      return hostname.includes(siteHost) || siteHost.includes(hostname)
    } catch {
      return false
    }
  }) || null
}

/**
 * Guardar/actualizar una estructura (por nombre)
 */
export async function saveStructure(structure: SiteStructure): Promise<void> {
  const structures = await getAllStructures()
  const existingIndex = structures.findIndex(
    s => s.name.toLowerCase() === structure.name.toLowerCase()
  )

  if (existingIndex >= 0) {
    structures[existingIndex] = structure
  } else {
    structures.push(structure)
  }

  await chrome.storage.local.set({ [STRUCTURES_KEY]: structures })
}

/**
 * Eliminar una estructura por nombre
 */
export async function deleteStructure(name: string): Promise<void> {
  const structures = await getAllStructures()
  const filtered = structures.filter(
    s => s.name.toLowerCase() !== name.toLowerCase()
  )
  await chrome.storage.local.set({ [STRUCTURES_KEY]: filtered })
}

/**
 * Obtener nombres de todos los sitios disponibles
 */
export async function getSiteNames(): Promise<string[]> {
  const structures = await getAllStructures()
  return structures.map(s => s.name)
}

/**
 * Construir la URL de búsqueda a partir de la estructura y la query
 */
export function buildSearchUrl(structure: SiteStructure, query: string): string {
  let url = structure.search_url.replace('{query}', encodeURIComponent(query))
  return url
}
