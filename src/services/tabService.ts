// src/services/tabService.ts

export async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs[0]
}

export function isSpecialPage(url: string | undefined): boolean {
    if (!url) return true
    return (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:')
    )
}

export async function executeScriptInTab<T>(
    tabId: number,
    func: () => T
): Promise<T> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func
    })
    return results[0]?.result as T
}

export async function executeScriptWithArgs<T, A extends any[]>(
    tabId: number,
    func: (...args: A) => T,
    args: A
): Promise<T> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
    })
    return results[0]?.result as T
}