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

export type ConditionEffect = 'highlight' | 'hide' | 'remove'

export interface ConditionCommandDefinition {
    name: string
    effect: ConditionEffect
    triggers?: string[]
    createdAt: string
}

export interface ListConditionCommandsResult {
    action: 'listConditionCommands'
    commands: ConditionCommandDefinition[]
    total: number
}

export interface ScriptCommandDefinition {
    name: string
    description?: string
    code: string
    plan?: ScriptCommandPlan
    triggers?: string[]
    createdAt: string
}

export interface ListScriptCommandsResult {
    action: 'listScriptCommands'
    commands: ScriptCommandDefinition[]
    total: number
}

export type ScriptPlanStepType =
    | 'popup_elements'
    | 'highlight_elements'
    | 'hide_elements'
    | 'remove_elements'
    | 'console_log'

export interface ScriptPlanStep {
    type: ScriptPlanStepType
    title?: string
    maxItems?: number
    maxChars?: number
}

export interface ScriptCommandPlan {
    steps: ScriptPlanStep[]
}

export interface ColorOption {
    name: string
    value: string | null
}

// ============ Schema de Estructura (structureSearchAI.json) ============

/**
 * Define una propiedad individual del objeto semántico.
 * Cada propiedad tiene un tipo, un nombre y un selector CSS para extraerla.
 * 
 * type_schema: tipo de dato a extraer
 *   - "string"  → extrae textContent
 *   - "url"     → extrae atributo href del <a>
 *   - "number"  → extrae número del textContent
 *   - "date"    → extrae patrón de fecha/año del textContent
 *   - "array"   → extrae múltiples matches como array de strings
 *   - "html"    → extrae innerHTML
 */
export interface PropertySchema {
    type_schema: string
    name_schema: string
    selector_css_schema: string
}

/**
 * Estructura genérica de un sitio — ya NO tiene selectores fijos.
 * Las propiedades del objeto son dinámicas, definidas por la IA al analizar la página.
 */
export interface SiteStructure {
    name: string
    url: string
    domain: string
    search_url: string
    search_params: Record<string, string>
    result_container_selector: string  // Selector del contenedor que se repite por cada resultado
    object_semantic_structure_schema: {
        type: string
    }
    properties_object_semantic_structure_schema: PropertySchema[]
}

// ============ Resultados de Scraping (genéricos) ============

/**
 * Un resultado individual extraído — las propiedades son dinámicas.
 * Ejemplo: { title: "...", authors: "...", date: "2024", url: "https://..." }
 */
export type ScrapedItem = Record<string, any>

export interface ScrapeResult {
    source: string
    domain: string
    url: string
    query: string
    totalResults: number
    results: ScrapedItem[]
    action: string
    semantic_type: string
    properties: string[]  // Nombres de las propiedades extraídas (para renderizar)
}

// ============ Resultados de comandos ============

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
