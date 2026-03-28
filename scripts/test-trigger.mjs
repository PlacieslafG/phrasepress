/**
 * Script DEBUG per testare il meccanismo di triggerRestart() in isolamento.
 *
 * Uso:
 *   node scripts/test-trigger.mjs
 *
 * Legge il bootId attuale da /health, scrive il trigger file,
 * poi fa polling su /health finché il bootId cambia.
 * Stampa ogni step con timestamp precisi.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Stesso percorso usato da core/src/api/plugins.ts
const TRIGGER_FILE = resolve(__dirname, '../packages/core/src/api/restart-trigger.ts')
const HEALTH_URL   = 'http://localhost:3000/api/v1/health'

function ts() {
  return new Date().toISOString()
}

async function getBootId() {
  const res = await fetch(HEALTH_URL)
  const body = await res.json()
  return body.bootId ?? null
}

function showTriggerFileInfo() {
  if (existsSync(TRIGGER_FILE)) {
    const content = readFileSync(TRIGGER_FILE, 'utf8').trim()
    console.log(`  Trigger file: ${TRIGGER_FILE}`)
    console.log(`  Contenuto:    ${content}`)
  } else {
    console.log(`  Trigger file: ${TRIGGER_FILE}`)
    console.log(`  Contenuto:    (file non esiste)`)
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════')
  console.log('  TEST TRIGGER RESTART — PhrasePress')
  console.log('══════════════════════════════════════════════════════\n')

  // Step 1: Stato iniziale trigger file
  console.log(`[${ts()}] Step 1 — Stato attuale trigger file:`)
  showTriggerFileInfo()
  console.log()

  // Step 2: Leggi bootId attuale
  console.log(`[${ts()}] Step 2 — Lettura bootId da ${HEALTH_URL}...`)
  let bootIdBefore
  try {
    bootIdBefore = await getBootId()
    console.log(`  bootId attuale: ${bootIdBefore}`)
  } catch (err) {
    console.error(`  ERRORE: impossibile raggiungere il server: ${err.message}`)
    console.error('  Assicurati che il server sia avviato (pnpm dev)')
    process.exit(1)
  }
  console.log()

  // Step 3: Scrivi il trigger file
  console.log(`[${ts()}] Step 3 — Scrittura trigger file su:`)
  console.log(`  ${TRIGGER_FILE}`)
  try {
    writeFileSync(TRIGGER_FILE, `// restart trigger — auto-generated\nexport const t = ${Date.now()}\n`)
    console.log('  ✓ Scrittura riuscita')
  } catch (err) {
    console.error(`  ✗ ERRORE scrittura: ${err.message}`)
    process.exit(1)
  }
  console.log(`  Nuovo contenuto: ${readFileSync(TRIGGER_FILE, 'utf8').trim()}`)
  console.log()

  // Step 4: Polling bootId
  console.log(`[${ts()}] Step 4 — Polling /health fino a cambio bootId (max 30s)...`)
  const startMs  = Date.now()
  const TIMEOUT  = 30_000
  let pollCount  = 0

  while (Date.now() - startMs < TIMEOUT) {
    await new Promise(r => setTimeout(r, 500))
    pollCount++

    let bootIdNow
    try {
      bootIdNow = await getBootId()
    } catch {
      console.log(`[${ts()}]   poll #${pollCount} — server non raggiungibile (sta riavviando?)`)
      continue
    }

    if (bootIdNow !== bootIdBefore) {
      const elapsed = Date.now() - startMs
      console.log(`[${ts()}]   poll #${pollCount} — bootId CAMBIATO! ✓`)
      console.log(`  Vecchio: ${bootIdBefore}`)
      console.log(`  Nuovo:   ${bootIdNow}`)
      console.log(`  Tempo:   ${elapsed}ms`)
      console.log()
      console.log('══════════════════════ RISULTATO: ✅ TRIGGER FUNZIONA ══════════════════════')
      return
    } else {
      console.log(`[${ts()}]   poll #${pollCount} — bootId invariato: ${bootIdNow}`)
    }
  }

  console.log()
  console.log('══════════════════════ RISULTATO: ❌ TRIGGER NON FUNZIONA ══════════════════════')
  console.log('Il bootId non è cambiato entro 30 secondi dopo la scrittura del trigger file.')
  console.log()
  console.log('Possibili cause:')
  console.log('  1. nodemon non sta guardando questo file (controlla nodemon.json)')
  console.log('  2. nodemon ignora i dotfiles (.restart-trigger.ts)')
  console.log('  3. Il server non usa nodemon in questo ambiente')
  console.log()
  console.log('Controlla il terminale dove gira il server per messaggi di nodemon.')
}

main().catch(err => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
