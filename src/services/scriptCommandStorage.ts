import type { ScriptCommandDefinition } from '../types'

const SCRIPT_COMMANDS_KEY = 'script_commands'

export async function getScriptCommands(): Promise<ScriptCommandDefinition[]> {
  try {
    const result = await chrome.storage.local.get(SCRIPT_COMMANDS_KEY)
    const stored = result[SCRIPT_COMMANDS_KEY]
    if (!Array.isArray(stored)) return []

    return stored
      .map(migrateScriptCommand)
      .filter((item): item is ScriptCommandDefinition => Boolean(item))
  } catch {
    return []
  }
}

export async function saveScriptCommand(
  command: Omit<ScriptCommandDefinition, 'createdAt'> & { createdAt?: string }
): Promise<ScriptCommandDefinition> {
  const list = await getScriptCommands()
  const normalizedName = normalizeName(command.name)

  if (!normalizedName) {
    throw new Error('El comando debe tener un nombre válido.')
  }
  if (!String(command.code || '').trim()) {
    throw new Error('El comando debe incluir código JavaScript.')
  }

  const normalizedTriggers = normalizeTriggers(command.triggers || [])
  const finalCommand: ScriptCommandDefinition = {
    name: normalizedName,
    description: String(command.description || '').trim(),
    code: String(command.code),
    plan: normalizePlan(command.plan),
    triggers: normalizedTriggers.length > 0 ? normalizedTriggers : [normalizedName],
    createdAt: command.createdAt || new Date().toISOString()
  }

  const index = list.findIndex((item) => normalizeKey(item.name) === normalizeKey(normalizedName))
  if (index >= 0) {
    const previous = list[index]
    list[index] = {
      ...previous,
      ...finalCommand,
      createdAt: previous.createdAt || finalCommand.createdAt,
      triggers: dedupe([...(previous.triggers || []), ...(finalCommand.triggers || [])])
    }
  } else {
    list.push(finalCommand)
  }

  await chrome.storage.local.set({ [SCRIPT_COMMANDS_KEY]: list })
  return list[index >= 0 ? index : list.length - 1]
}

export async function findScriptCommand(nameOrTrigger: string): Promise<ScriptCommandDefinition | null> {
  const list = await getScriptCommands()
  const normalized = normalizeKey(nameOrTrigger)
  if (!normalized) return null

  const exact = list.find((item) => normalizeKey(item.name) === normalized)
  if (exact) return exact

  const trigger = list.find((item) =>
    (item.triggers || []).some((t) => normalizeKey(t) === normalized)
  )
  if (trigger) return trigger

  return (
    list.find((item) => {
      const candidates = [item.name, ...(item.triggers || [])].map(normalizeKey)
      return candidates.some((candidate) => normalized.includes(candidate) || candidate.includes(normalized))
    }) || null
  )
}

export async function deleteScriptCommand(name: string): Promise<boolean> {
  const list = await getScriptCommands()
  const normalized = normalizeKey(name)
  if (!normalized) return false

  const filtered = list.filter((item) => normalizeKey(item.name) !== normalized)
  if (filtered.length === list.length) return false

  await chrome.storage.local.set({ [SCRIPT_COMMANDS_KEY]: filtered })
  return true
}

function migrateScriptCommand(raw: any): ScriptCommandDefinition | null {
  const name = normalizeName(raw?.name || '')
  const code = String(raw?.code || '').trim()
  if (!name || !code) return null

  return {
    name,
    description: String(raw?.description || '').trim(),
    code,
    plan: normalizePlan(raw?.plan),
    triggers: normalizeTriggers(raw?.triggers || []),
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString()
  }
}

function normalizePlan(plan: any): ScriptCommandDefinition['plan'] {
  if (!plan || !Array.isArray(plan.steps)) return undefined

  const steps = plan.steps
    .filter((step: any) => step && typeof step.type === 'string')
    .map((step: any) => ({
      type: step.type,
      title: typeof step.title === 'string' ? step.title : undefined,
      maxItems: Number.isFinite(step.maxItems) ? step.maxItems : undefined,
      maxChars: Number.isFinite(step.maxChars) ? step.maxChars : undefined
    }))

  if (steps.length === 0) return undefined
  return { steps }
}

function normalizeTriggers(triggers: string[]): string[] {
  return dedupe(
    triggers
      .map((trigger) => normalizeName(trigger))
      .filter(Boolean)
  )
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []

  items.forEach((item) => {
    const key = normalizeKey(item)
    if (!key || seen.has(key)) return
    seen.add(key)
    output.push(item)
  })

  return output
}

function normalizeName(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}
