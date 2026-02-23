// src/dsl/executor.ts

import type { DSLCommand } from '../types'
import { getActiveTab, isSpecialPage, executeScriptWithArgs } from '../services/tabService'

// ... resto del código igual
export async function executeCommand(command: DSLCommand): Promise<any> {
    const tab = await getActiveTab()

    if (!tab?.id) {
        throw new Error('No se pudo obtener la pestaña activa')
    }

    if (isSpecialPage(tab.url)) {
        throw new Error('Esta extensión no funciona en páginas especiales del navegador')
    }

    switch (command.action) {
        case 'changeColor':
            const result = await executeChangeColor(tab.id, command.params.color)
            return { ...result, action: 'changeColor' }

        case 'getTitles':
            const titles = await executeGetTitles(tab.id)
            return { ...titles, action: 'getTitles' }

        default:
            throw new Error(`Comando desconocido: ${command.action}`)
    }
}

async function executeChangeColor(tabId: number, color: string | null) {
    await executeScriptWithArgs(
        tabId,
        (colorValue: string | null) => {
            const h1Elements = document.querySelectorAll('h1')
            const h2Elements = document.querySelectorAll('h2')
            const h3Elements = document.querySelectorAll('h3')

            if (colorValue === null) {
                h1Elements.forEach(h => h.style.color = '')
                h2Elements.forEach(h => h.style.color = '')
                h3Elements.forEach(h => h.style.color = '')
            } else {
                h1Elements.forEach(h => h.style.color = colorValue)
                h2Elements.forEach(h => h.style.color = colorValue)
                h3Elements.forEach(h => h.style.color = colorValue)
            }
        },
        [color]
    )
    return { success: true, color }
}

async function executeGetTitles(tabId: number) {
    const titles = await executeScriptWithArgs(
        tabId,
        () => {
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
                url: window.location.href
            }
        },
        []
    )
    return titles
}