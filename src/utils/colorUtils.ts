// src/utils/colorUtils.ts

import type { ColorOption } from '../types'

export const PREDEFINED_COLORS: ColorOption[] = [
  { name: 'Rojo', value: '#ff0000' },
  { name: 'Azul', value: '#0066ff' },
  { name: 'Verde', value: '#00aa00' },
  { name: 'Morado', value: '#8b00ff' },
  { name: 'Naranja', value: '#ff6600' },
  { name: 'Rosa', value: '#ff00aa' },
  { name: 'Restaurar', value: null }
]

export function findColorByName(name: string): ColorOption | undefined {
  return PREDEFINED_COLORS.find(
    c => c.name.toLowerCase() === name.toLowerCase()
  )
}