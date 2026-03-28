import { describe, it, expect } from 'vitest'
import { isValidCapability, hasCapability, ALL_CAPABILITIES } from '../../auth/capabilities.js'

describe('isValidCapability', () => {
  it('ritorna true per ogni capability valida', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(isValidCapability(cap)).toBe(true)
    }
  })

  it('ritorna false per stringhe sconosciute', () => {
    expect(isValidCapability('fly')).toBe(false)
    expect(isValidCapability('')).toBe(false)
    expect(isValidCapability('EDIT_POSTS')).toBe(false) // case-sensitive, also old WP name
  })
})

describe('hasCapability', () => {
  it('administrator ha sempre tutte le capability', () => {
    expect(hasCapability('administrator', [],               'manage_options')).toBe(true)
    expect(hasCapability('administrator', [],               'edit_folios')).toBe(true)
    expect(hasCapability('administrator', [],               'anything')).toBe(true)
  })

  it('ruolo non-admin con la capability richiesta → true', () => {
    expect(hasCapability('editor', ['edit_folios', 'read'], 'edit_folios')).toBe(true)
  })

  it('ruolo non-admin senza la capability richiesta → false', () => {
    expect(hasCapability('editor', ['read'], 'manage_options')).toBe(false)
  })

  it('lista capability vuota → false per qualsiasi ruolo non-admin', () => {
    expect(hasCapability('author', [], 'edit_folios')).toBe(false)
  })
})
