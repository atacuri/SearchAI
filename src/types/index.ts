// src/types/index.ts

export interface PageTitles {
    pageTitle: string
    h1Titles: Array<{ text: string; html: string }>
    h2Titles: Array<{ text: string; html: string }>
    h3Titles: Array<{ text: string; html: string }>
    url: string
}

export interface DSLCommand {
    action: string
    params: Record<string, any>
}

export interface ColorOption {
    name: string
    value: string | null
}

// ============ Scraping Types ============

/**
 * Selectores CSS que la IA genera al analizar una página de resultados.
 * Estos permiten scrapear CUALQUIER sitio de forma genérica.
 */
export interface SiteSelectors {
    resultContainer: string   // Selector del contenedor de CADA resultado (se repite N veces)
    title: string             // Selector del título dentro de cada resultado
    titleLink: string         // Selector del link del título (para extraer href)
    authors: string           // Selector del texto de autores
    authorLinks: string       // Selector de los links de autores (si existen)
    date: string              // Selector del elemento que contiene la fecha/año
    abstract: string          // Selector del abstract/snippet
    citations: string         // Selector del info de citaciones
}

export interface SiteStructure {
    name: string
    url: string
    domain: string
    search_url: string
    search_params: Record<string, string>
    selectors: SiteSelectors
    semantic_structure: {
        type: string
    }
}

export interface ScrapedAuthor {
    name: string
    url: string
}

export interface ScrapedArticle {
    title: string
    url: string
    date: string
    authors: ScrapedAuthor[]
    citations: string
    abstract: string
}

export interface ScrapeResult {
    source: string
    domain: string
    url: string
    query: string
    totalResults: number
    results: ScrapedArticle[]
    action: string
    semantic_type: string
}

export interface CreateStructureResult {
    action: 'createStructure'
    success: boolean
    structure: SiteStructure
    message: string
}

export interface ListStructuresResult {
    action: 'listStructures'
    structures: SiteStructure[]
    total: number
}