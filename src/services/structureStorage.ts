// src/services/structureStorage.ts
// Servicio para almacenar y gestionar estructuras de sitios en chrome.storage.local
// Las estructuras ahora usan SELECTORES CSS generados por IA

import type { SiteStructure } from '../types'

const STRUCTURES_KEY = 'site_structures'

// Estructura por defecto de Google Scholar (con selectores CSS)
const DEFAULT_STRUCTURES: SiteStructure[] = [
  {
    name: "Google Scholar",
    url: "https://scholar.google.com",
    domain: "academic",
    search_url: "https://scholar.google.com/scholar?q={query}",
    search_params: { q: "query" },
    selectors: {
      resultContainer: ".gs_r.gs_or.gs_scl",
      title: ".gs_rt",
      titleLink: ".gs_rt a",
      authors: ".gs_a",
      authorLinks: ".gs_a a",
      date: ".gs_a",
      abstract: ".gs_rs",
      citations: ".gs_fl.gs_flb a"
    },
    semantic_structure: {
      type: "ArticleScientific"
    }
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
    return stored as SiteStructure[]
  } catch {
    return DEFAULT_STRUCTURES
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
