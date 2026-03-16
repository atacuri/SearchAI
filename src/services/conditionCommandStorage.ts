import type { ConditionCommandDefinition, ConditionEffect } from '../types'

const CONDITION_COMMANDS_KEY = 'condition_commands'

export async function getConditionCommands(): Promise<ConditionCommandDefinition[]> {
  try {
    const result = await chrome.storage.local.get(CONDITION_COMMANDS_KEY)
    const stored = result[CONDITION_COMMANDS_KEY]
    if (!Array.isArray(stored)) return []
    return stored
      .map(migrateConditionCommand)
      .filter((cmd): cmd is ConditionCommandDefinition => Boolean(cmd))
  } catch {
    return []
  }
}

export async function saveConditionCommand(
  command: Omit<ConditionCommandDefinition, 'createdAt'> & { createdAt?: string }
): Promise<ConditionCommandDefinition> {
  const commands = await getConditionCommands()
  const normalizedName = normalizeCommandName(command.name)

  if (!normalizedName) {
    throw new Error('El comando debe tener un nombre válido.')
  }

  const normalizedTriggers = normalizeTriggers(command.triggers || [])
  const effect = normalizeEffect(command.effect)

  const finalCommand: ConditionCommandDefinition = {
    name: normalizedName,
    effect,
    triggers: normalizedTriggers.length > 0 ? normalizedTriggers : [normalizedName],
    createdAt: command.createdAt || new Date().toISOString()
  }

  const index = commands.findIndex((item) => normalizeKey(item.name) === normalizeKey(normalizedName))
  if (index >= 0) {
    const previous = commands[index]
    commands[index] = {
      ...previous,
      ...finalCommand,
      createdAt: previous.createdAt || finalCommand.createdAt,
      triggers: dedupe([...(previous.triggers || []), ...(finalCommand.triggers || [])])
    }
  } else {
    commands.push(finalCommand)
  }

  await chrome.storage.local.set({ [CONDITION_COMMANDS_KEY]: commands })
  return commands[index >= 0 ? index : commands.length - 1]
}

export async function findConditionCommand(nameOrTrigger: string): Promise<ConditionCommandDefinition | null> {
  const commands = await getConditionCommands()
  const normalized = normalizeKey(nameOrTrigger)

  if (!normalized) return null

  const exact = commands.find((cmd) => normalizeKey(cmd.name) === normalized)
  if (exact) return exact

  const triggerMatch = commands.find((cmd) =>
    (cmd.triggers || []).some((trigger) => normalizeKey(trigger) === normalized)
  )
  if (triggerMatch) return triggerMatch

  return (
    commands.find((cmd) => {
      const allNames = [cmd.name, ...(cmd.triggers || [])].map(normalizeKey)
      return allNames.some((candidate) => normalized.includes(candidate) || candidate.includes(normalized))
    }) || null
  )
}

export async function deleteConditionCommand(name: string): Promise<boolean> {
  const commands = await getConditionCommands()
  const normalized = normalizeKey(name)
  if (!normalized) return false

  const filtered = commands.filter((cmd) => normalizeKey(cmd.name) !== normalized)
  if (filtered.length === commands.length) {
    return false
  }

  await chrome.storage.local.set({ [CONDITION_COMMANDS_KEY]: filtered })
  return true
}

function migrateConditionCommand(raw: any): ConditionCommandDefinition | null {
  const name = normalizeCommandName(raw?.name || raw?.command || '')
  if (!name) return null

  return {
    name,
    effect: normalizeEffect(raw?.effect || raw?.operation || raw?.behavior),
    triggers: normalizeTriggers(raw?.triggers || []),
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString()
  }
}

function normalizeCommandName(name: string): string {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeTriggers(triggers: string[]): string[] {
  return dedupe(
    triggers
      .map((trigger) => normalizeCommandName(trigger))
      .filter(Boolean)
  )
}

function normalizeEffect(effect: string): ConditionEffect {
  const normalized = normalizeKey(effect || '')

  if (['remove', 'delete', 'eliminar', 'borrar', 'quitar'].some((word) => normalized.includes(word))) {
    return 'remove'
  }

  if (['hide', 'ocultar', 'esconder'].some((word) => normalized.includes(word))) {
    return 'hide'
  }

  return 'highlight'
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

function normalizeKey(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}
