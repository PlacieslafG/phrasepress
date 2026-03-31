import { resolve, normalize } from 'node:path'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import type { PluginContext } from '@phrasepress/core'
import type { ToolDefinition } from '../providers/types.js'
import type { AiSettings } from '../db.js'

// ─── Tipo condiviso per il contesto dei tool ──────────────────────────────────

export interface CodexSummary {
  name:   string
  label:  string
  stages: Array<{ name: string; label: string }>
}

export interface ToolContext {
  db:                PluginContext['db']
  allowedPaths:      string[]
  configuredPlugins: string[]
  codices:           CodexSummary[]
}

// ─── Interfaccia tool ──────────────────────────────────────────────────────────

export interface AiTool {
  definition: ToolDefinition
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<string>
}

// ─── Security: percorsi sempre vietati (hardcoded, non configurabili) ────────

const BLOCKED_PATHS = [
  'packages/core/src',
  'packages/admin/src',
  'packages/plugins',
  'node_modules',
  '.git',
  'config',        // phrasepress.config.ts, segreti
].map(p => resolve(normalize(p)))

// ─── Security: verifica che il path sia dentro una allowedPath ────────────────

function assertAllowed(targetPath: string, allowedPaths: string[]): void {
  if (allowedPaths.length === 0) {
    throw new Error('Nessun percorso autorizzato configurato. Configura allowedPaths in AI Settings.')
  }
  const resolved = resolve(normalize(targetPath))

  // Percorsi bloccati in modo assoluto, indipendentemente da allowedPaths
  const isBlocked = BLOCKED_PATHS.some(blocked =>
    resolved === blocked || resolved.startsWith(blocked + '/'),
  )
  if (isBlocked) {
    throw new Error(`Accesso negato: il percorso "${targetPath}" è protetto e non può essere letto o modificato.`)
  }

  const isAllowed = allowedPaths.some(allowed => {
    const resolvedAllowed = resolve(normalize(allowed))
    return resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + '/')
  })
  if (!isAllowed) {
    throw new Error(`Accesso negato: il percorso "${targetPath}" non è nella allowlist.`)
  }
}

// ─── Tool: read_folio ─────────────────────────────────────────────────────────

const readFolioTool: AiTool = {
  definition: {
    name:        'read_folio',
    description: 'Legge un folio (contenuto CMS) dal database dato il suo codex e ID.',
    parameters: {
      type: 'object',
      required: ['codex', 'id'],
      properties: {
        codex: { type: 'string', description: 'Il tipo di contenuto (es. "article", "product")' },
        id:    { type: 'number', description: "L'ID numerico del folio" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { get(...args: unknown[]): unknown } } }).$client
    const row = client.prepare(`SELECT * FROM folios WHERE id = ? AND codex = ?`).get(input.id, input.codex) as Record<string, unknown> | undefined
    if (!row) return `Folio non trovato: codex="${input.codex}", id=${input.id}`
    const fields = JSON.parse(row.fields as string) as Record<string, unknown>
    return JSON.stringify({ id: row.id, codex: row.codex, stage: row.stage, fields }, null, 2)
  },
}

// ─── Tool: search_folios ──────────────────────────────────────────────────────

const searchFoliosTool: AiTool = {
  definition: {
    name:        'search_folios',
    description: 'Cerca folios per titolo o contenuto. Restituisce i primi 10 risultati.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Testo da cercare nel titolo o nei campi. Usa stringa vuota per elencare tutti i contenuti.' },
        codex: { type: 'string', description: 'Filtra per tipo di contenuto (es. "article", "guide"). SEMPRE specificarlo per ottenere risultati precisi.' },
        limit: { type: 'number', description: 'Numero massimo di risultati (default 50, max 200)' },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(...args: unknown[]): unknown[] } } }).$client
    const likeQuery = input.query ? `%${String(input.query)}%` : '%'
    const limit     = Math.min(Number(input.limit ?? 50), 200)
    let rows: unknown[]
    if (input.codex) {
      rows = client.prepare(`
        SELECT id, codex, stage, fields FROM folios
        WHERE codex = ? AND fields LIKE ?
        ORDER BY id DESC LIMIT ?
      `).all(input.codex, likeQuery, limit)
    } else {
      rows = client.prepare(`
        SELECT id, codex, stage, fields FROM folios
        WHERE fields LIKE ?
        ORDER BY id DESC LIMIT ?
      `).all(likeQuery, limit)
    }
    if (rows.length === 0) return 'Nessun folio trovato.'
    const items = rows.map(r => {
      const row = r as Record<string, unknown>
      const fields = JSON.parse(row.fields as string) as Record<string, unknown>
      return { id: row.id, codex: row.codex, stage: row.stage, title: fields.title ?? fields.name ?? '(senza titolo)' }
    })
    return JSON.stringify({ total: items.length, items }, null, 2)
  },
}

// ─── Tool: write_folio ────────────────────────────────────────────────────────

const writeFolioTool: AiTool = {
  definition: {
    name:        'write_folio',
    description: 'Aggiorna i campi di un folio esistente.',
    parameters: {
      type: 'object',
      required: ['id', 'codex', 'fields'],
      properties: {
        id:     { type: 'number', description: "L'ID numerico del folio da aggiornare" },
        codex:  { type: 'string', description: 'Il tipo di contenuto del folio' },
        fields: { type: 'object', description: 'Oggetto con i campi da aggiornare (merge parziale)' },
        stage:  { type: 'string', description: 'Nuovo stage (opzionale, es. "published")' },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...args: unknown[]): unknown; run(...args: unknown[]): void }
    } }).$client
    const existing = client.prepare(`SELECT * FROM folios WHERE id = ? AND codex = ?`).get(input.id, input.codex) as Record<string, unknown> | undefined
    if (!existing) return `Folio non trovato: codex="${input.codex}", id=${input.id}`

    const currentFields = JSON.parse(existing.fields as string) as Record<string, unknown>
    const updatedFields = { ...currentFields, ...(input.fields as Record<string, unknown>) }
    const now = Date.now()

    // Salva revisione prima di aggiornare
    client.prepare(`
      INSERT INTO folio_revisions (folio_id, stage, fields, created_at)
      VALUES (?, ?, ?, ?)
    `).run(input.id, existing.stage, existing.fields, now)

    const newStage = (input.stage as string | undefined) ?? (existing.stage as string)
    client.prepare(`
      UPDATE folios SET fields = ?, stage = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(updatedFields), newStage, now, input.id)

    return `Folio ${input.id} aggiornato con successo.`
  },
}

// ─── Tool: create_folio ───────────────────────────────────────────────────────

const createFolioTool: AiTool = {
  definition: {
    name:        'create_folio',
    description: 'Crea un nuovo folio nel CMS.',
    parameters: {
      type: 'object',
      required: ['codex', 'fields'],
      properties: {
        codex:  { type: 'string', description: 'Il tipo di contenuto (es. "article", "product")' },
        fields: { type: 'object', description: 'Campi iniziali del folio (es. title, body, ecc.)' },
        stage:  { type: 'string', description: 'Stage iniziale (default: "draft")' },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { run(...args: unknown[]): void; all(...args: unknown[]): unknown[] }
    } }).$client
    const now   = Date.now()
    const stage = (input.stage as string | undefined) ?? 'draft'
    client.prepare(`
      INSERT INTO folios (codex, stage, fields, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.codex, stage, JSON.stringify(input.fields ?? {}), now, now)
    const rows = client.prepare(`SELECT id FROM folios WHERE codex = ? ORDER BY id DESC LIMIT 1`).all(input.codex) as { id: number }[]
    const newId = rows[0]?.id
    return `Folio creato con ID ${newId} (codex: ${input.codex}, stage: ${stage}).`
  },
}

// ─── Tool: read_file ──────────────────────────────────────────────────────────

const readFileTool: AiTool = {
  definition: {
    name:        'read_file',
    description: 'Legge il contenuto di un file dal filesystem del progetto.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Percorso assoluto del file da leggere' },
      },
    },
  },
  async execute(input, ctx) {
    const filePath = String(input.path)
    console.log(`[AI TOOL] read_file → "${filePath}" | allowed: ${JSON.stringify(ctx.allowedPaths)}`)
    assertAllowed(filePath, ctx.allowedPaths)
    console.log(`[AI TOOL] read_file ✓ accesso consentito, lettura in corso...`)
    try {
      const content = await readFile(filePath, 'utf-8')
      // Limita a 10k chars per non ingolfare il contesto
      if (content.length > 10_000) {
        return content.slice(0, 10_000) + '\n\n[... file troncato dopo 10.000 caratteri]'
      }
      return content
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Errore nella lettura del file: ${msg}`
    }
  },
}

// ─── Tool: write_file ─────────────────────────────────────────────────────────

const writeFileTool: AiTool = {
  definition: {
    name:        'write_file',
    description: 'Scrive o sovrascrive un file sul filesystem del progetto.',
    parameters: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path:    { type: 'string', description: 'Percorso assoluto del file da scrivere' },
        content: { type: 'string', description: 'Contenuto da scrivere nel file' },
      },
    },
  },
  async execute(input, ctx) {
    const filePath = String(input.path)
    console.log(`[AI TOOL] write_file → "${filePath}" | allowed: ${JSON.stringify(ctx.allowedPaths)}`)
    assertAllowed(filePath, ctx.allowedPaths)
    console.log(`[AI TOOL] write_file ✓ accesso consentito, scrittura in corso...`)
    try {
      await writeFile(filePath, String(input.content), 'utf-8')
      return `File scritto con successo: ${filePath}`
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Errore nella scrittura del file: ${msg}`
    }
  },
}

// ─── Tool: list_files ─────────────────────────────────────────────────────────

const listFilesTool: AiTool = {
  definition: {
    name:        'list_files',
    description: 'Elenca i file e le cartelle in una directory del progetto.',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Percorso assoluto della directory da listare' },
      },
    },
  },
  async execute(input, ctx) {
    const dirPath = String(input.path)
    console.log(`[AI TOOL] list_files → "${dirPath}" | allowed: ${JSON.stringify(ctx.allowedPaths)}`)
    assertAllowed(dirPath, ctx.allowedPaths)
    console.log(`[AI TOOL] list_files ✓ accesso consentito, listing in corso...`)
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const lines   = await Promise.all(entries.map(async e => {
        const type = e.isDirectory() ? 'd' : 'f'
        let size = ''
        if (!e.isDirectory()) {
          try {
            const s = await stat(`${dirPath}/${e.name}`)
            size = ` (${s.size} bytes)`
          } catch { /* ignora */ }
        }
        return `[${type}] ${e.name}${size}`
      }))
      return lines.length === 0 ? 'Directory vuota.' : lines.join('\n')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Errore nel listare la directory: ${msg}`
    }
  },
}

// ─── Tool: get_plugin_status ──────────────────────────────────────────────────

const getPluginStatusTool: AiTool = {
  definition: {
    name:        'get_plugin_status',
    description: 'Restituisce lo stato dei plugin presenti nella configurazione corrente (attivi/disattivi). Passa include_removed=true per vedere anche i plugin rimossi dalla config ma ancora nel DB.',
    parameters: {
      type:       'object',
      properties: {
        include_removed: { type: 'boolean', description: 'Se true, include anche i plugin presenti nel DB ma non nella configurazione attuale' },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(): unknown[] } } }).$client
    const rows = client.prepare(`SELECT plugin_name, active FROM plugin_status ORDER BY plugin_name`).all() as { plugin_name: string; active: number }[]

    const configured = new Set(ctx.configuredPlugins)

    // Plugin nella config corrente, cross-referenziati col DB
    const current = ctx.configuredPlugins.map(name => {
      const row = rows.find(r => r.plugin_name === name)
      return { name, active: row ? row.active === 1 : false }
    })
    const active   = current.filter(p => p.active).map(p => p.name)
    const inactive = current.filter(p => !p.active).map(p => p.name)

    const result: Record<string, unknown> = { active, inactive }

    if (input.include_removed) {
      const removed = rows
        .filter(r => !configured.has(r.plugin_name))
        .map(r => r.plugin_name)
      result.removed_from_config = removed
    }

    return JSON.stringify(result, null, 2)
  },
}

// ─── Utility interna: slugify ─────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'term'
}

function uniqueTermSlug(
  client: { prepare(sql: string): { get(...a: unknown[]): unknown } },
  vocId:  number,
  base:   string,
  excludeId?: number,
): string {
  let candidate = base
  let n = 2
  while (true) {
    const row = client.prepare('SELECT id FROM terms WHERE vocabulary_id = ? AND slug = ?').get(vocId, candidate) as { id: number } | undefined
    if (!row || row.id === excludeId) return candidate
    candidate = `${base}-${n++}`
  }
}

// ─── Tool: get_site_info ──────────────────────────────────────────────────────

const getSiteInfoTool: AiTool = {
  definition: {
    name:        'get_site_info',
    description: 'Restituisce una panoramica del sito: tipi di contenuto (codices) registrati, tassonomie (vocabularies) e statistiche dei contenuti per tipo e stage. Utile come prima chiamata per orientarsi nel sito.',
    parameters:  { type: 'object', properties: {} },
  },
  async execute(_input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(): unknown[] } } }).$client

    // Statistiche folios per codex/stage
    const statsRows = client.prepare(`
      SELECT codex, stage, COUNT(*) as total FROM folios GROUP BY codex, stage
    `).all() as { codex: string; stage: string; total: number }[]
    const stats: Record<string, Record<string, number>> = {}
    for (const row of statsRows) {
      if (!stats[row.codex]) stats[row.codex] = {}
      stats[row.codex][row.stage] = row.total
    }

    // Vocabularies dal DB
    const vocRows = client.prepare(`SELECT id, name, slug, hierarchical FROM vocabularies ORDER BY name`).all() as {
      id: number; name: string; slug: string; hierarchical: number
    }[]

    return JSON.stringify({
      codices:     ctx.codices.map(c => ({ name: c.name, label: c.label, stages: c.stages, stats: stats[c.name] ?? {} })),
      vocabularies: vocRows.map(v => ({ id: v.id, name: v.name, slug: v.slug, hierarchical: v.hierarchical === 1 })),
    }, null, 2)
  },
}

// ─── Tool: delete_folio ───────────────────────────────────────────────────────

const deleteFolioTool: AiTool = {
  definition: {
    name:        'delete_folio',
    description: 'Sposta un folio nel cestino (stage="trash") oppure lo elimina definitivamente se permanent=true.',
    parameters: {
      type: 'object',
      required: ['id', 'codex'],
      properties: {
        id:        { type: 'number',  description: "ID del folio" },
        codex:     { type: 'string',  description: "Tipo di contenuto del folio" },
        permanent: { type: 'boolean', description: "Se true, elimina definitivamente (irreversibile). Default: false (mette in trash)." },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void }
    } }).$client
    const existing = client.prepare(`SELECT id FROM folios WHERE id = ? AND codex = ?`).get(input.id, input.codex)
    if (!existing) return `Folio non trovato: codex="${input.codex}", id=${input.id}`

    if (input.permanent) {
      client.prepare(`DELETE FROM folios WHERE id = ? AND codex = ?`).run(input.id, input.codex)
      return `Folio ${input.id} eliminato definitivamente.`
    } else {
      client.prepare(`UPDATE folios SET stage = 'trash', updated_at = ? WHERE id = ?`).run(Date.now(), input.id)
      return `Folio ${input.id} spostato nel cestino.`
    }
  },
}

// ─── Tool: get_folio_revisions ────────────────────────────────────────────────

const getFolioRevisionsTool: AiTool = {
  definition: {
    name:        'get_folio_revisions',
    description: 'Restituisce la cronologia delle revisioni di un folio. Ogni revisione è uno snapshot dei fields salvato prima di un aggiornamento.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id:    { type: 'number', description: "ID del folio" },
        limit: { type: 'number', description: "Numero massimo di revisioni da restituire (default 10)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(...a: unknown[]): unknown[] } } }).$client
    const limit = Math.min(Number(input.limit ?? 10), 50)
    const rows = client.prepare(`
      SELECT id, folio_id, stage, fields, created_at FROM folio_revisions
      WHERE folio_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(input.id, limit) as { id: number; folio_id: number; stage: string; fields: string; created_at: number }[]
    if (rows.length === 0) return `Nessuna revisione trovata per il folio ${input.id}.`
    return JSON.stringify(rows.map(r => ({
      revisionId: r.id,
      stage:      r.stage,
      fields:     JSON.parse(r.fields) as Record<string, unknown>,
      createdAt:  new Date(r.created_at).toISOString(),
    })), null, 2)
  },
}

// ─── Tool: search_terms ───────────────────────────────────────────────────────

const searchTermsTool: AiTool = {
  definition: {
    name:        'search_terms',
    description: 'Cerca o elenca i termini di una tassonomia (vocabulary). Utile per trovare categorie, tag o altri termini da assegnare a un folio.',
    parameters: {
      type: 'object',
      required: ['vocabulary'],
      properties: {
        vocabulary: { type: 'string', description: "Slug della tassonomia (es. \"category\", \"tag\")" },
        query:      { type: 'string', description: "Testo da cercare nel nome del termine. Ometti per listare tutti." },
        limit:      { type: 'number', description: "Numero massimo di risultati (default 50)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] } } }).$client
    const voc = client.prepare(`SELECT id, name, slug FROM vocabularies WHERE slug = ?`).get(input.vocabulary) as { id: number; name: string; slug: string } | undefined
    if (!voc) return `Tassonomia "${input.vocabulary}" non trovata. Usa get_site_info per vedere le tassonomie disponibili.`

    const limit  = Math.min(Number(input.limit ?? 50), 200)
    const likeQ  = input.query ? `%${String(input.query)}%` : '%'
    const rows = client.prepare(`
      SELECT t.id, t.name, t.slug, t.description, t.parent_id,
             CAST(COUNT(ft.folio_id) AS INTEGER) as post_count
      FROM terms t
      LEFT JOIN folio_terms ft ON ft.term_id = t.id
      WHERE t.vocabulary_id = ? AND t.name LIKE ?
      GROUP BY t.id ORDER BY t.name LIMIT ?
    `).all(voc.id, likeQ, limit) as { id: number; name: string; slug: string; description: string; parent_id: number | null; post_count: number }[]

    if (rows.length === 0) return `Nessun termine trovato in "${input.vocabulary}".`
    return JSON.stringify({ vocabulary: voc.slug, total: rows.length, terms: rows }, null, 2)
  },
}

// ─── Tool: create_term ────────────────────────────────────────────────────────

const createTermTool: AiTool = {
  definition: {
    name:        'create_term',
    description: 'Crea un nuovo termine in una tassonomia (es. una nuova categoria o tag).',
    parameters: {
      type: 'object',
      required: ['vocabulary', 'name'],
      properties: {
        vocabulary:  { type: 'string', description: "Slug della tassonomia (es. \"category\")" },
        name:        { type: 'string', description: "Nome del termine" },
        description: { type: 'string', description: "Descrizione opzionale" },
        parentId:    { type: 'number', description: "ID del termine padre (per tassonomie gerarchiche)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void; all(...a: unknown[]): unknown[] }
    } }).$client
    const voc = client.prepare(`SELECT id FROM vocabularies WHERE slug = ?`).get(input.vocabulary) as { id: number } | undefined
    if (!voc) return `Tassonomia "${input.vocabulary}" non trovata.`

    const baseSlug = slugify(String(input.name))
    const slug     = uniqueTermSlug(client, voc.id, baseSlug)

    client.prepare(`
      INSERT INTO terms (vocabulary_id, name, slug, description, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(voc.id, input.name, slug, input.description ?? '', input.parentId ?? null)

    const inserted = client.prepare(`SELECT id FROM terms WHERE vocabulary_id = ? AND slug = ?`).get(voc.id, slug) as { id: number }
    return `Termine "${input.name}" creato con ID ${inserted.id} (slug: ${slug}) in "${input.vocabulary}".`
  },
}

// ─── Tool: update_term ────────────────────────────────────────────────────────

const updateTermTool: AiTool = {
  definition: {
    name:        'update_term',
    description: 'Aggiorna il nome, la descrizione o il parent di un termine esistente.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id:          { type: 'number', description: "ID del termine da aggiornare" },
        name:        { type: 'string', description: "Nuovo nome" },
        description: { type: 'string', description: "Nuova descrizione" },
        parentId:    { type: 'number', description: "Nuovo parent ID (0 per rimuovere il parent)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void }
    } }).$client
    const existing = client.prepare(`SELECT * FROM terms WHERE id = ?`).get(input.id) as {
      id: number; vocabulary_id: number; name: string; slug: string; description: string; parent_id: number | null
    } | undefined
    if (!existing) return `Termine ID ${input.id} non trovato.`

    const newName  = (input.name as string | undefined) ?? existing.name
    const newDesc  = (input.description as string | undefined) ?? existing.description
    const newParent = input.parentId !== undefined
      ? (Number(input.parentId) === 0 ? null : Number(input.parentId))
      : existing.parent_id

    // Rigenera slug solo se il nome è cambiato
    let slug = existing.slug
    if (input.name && String(input.name) !== existing.name) {
      slug = uniqueTermSlug(client, existing.vocabulary_id, slugify(String(input.name)), existing.id)
    }

    client.prepare(`UPDATE terms SET name = ?, slug = ?, description = ?, parent_id = ? WHERE id = ?`)
      .run(newName, slug, newDesc, newParent, input.id)

    return `Termine ID ${input.id} aggiornato: nome="${newName}", slug="${slug}".`
  },
}

// ─── Tool: delete_term ────────────────────────────────────────────────────────

const deleteTermTool: AiTool = {
  definition: {
    name:        'delete_term',
    description: 'Elimina un termine da una tassonomia. Il termine viene rimosso anche da tutti i folios a cui era assegnato.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: "ID del termine da eliminare" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void }
    } }).$client
    const existing = client.prepare(`SELECT id, name FROM terms WHERE id = ?`).get(input.id) as { id: number; name: string } | undefined
    if (!existing) return `Termine ID ${input.id} non trovato.`
    client.prepare(`DELETE FROM terms WHERE id = ?`).run(input.id)
    return `Termine "${existing.name}" (ID ${input.id}) eliminato.`
  },
}

// ─── Tool: get_folio_terms ────────────────────────────────────────────────────

const getFolioTermsTool: AiTool = {
  definition: {
    name:        'get_folio_terms',
    description: 'Restituisce i termini assegnati a un folio, raggruppati per tassonomia.',
    parameters: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: "ID del folio" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(...a: unknown[]): unknown[] } } }).$client
    const rows = client.prepare(`
      SELECT t.id, t.name, t.slug, v.slug as vocabulary_slug, v.name as vocabulary_name
      FROM folio_terms ft
      JOIN terms t ON t.id = ft.term_id
      JOIN vocabularies v ON v.id = t.vocabulary_id
      WHERE ft.folio_id = ?
      ORDER BY v.name, t.name
    `).all(input.id) as { id: number; name: string; slug: string; vocabulary_slug: string; vocabulary_name: string }[]

    if (rows.length === 0) return `Nessun termine assegnato al folio ${input.id}.`

    const grouped: Record<string, { id: number; name: string; slug: string }[]> = {}
    for (const r of rows) {
      if (!grouped[r.vocabulary_slug]) grouped[r.vocabulary_slug] = []
      grouped[r.vocabulary_slug].push({ id: r.id, name: r.name, slug: r.slug })
    }
    return JSON.stringify(grouped, null, 2)
  },
}

// ─── Tool: set_folio_terms ────────────────────────────────────────────────────

const setFolioTermsTool: AiTool = {
  definition: {
    name:        'set_folio_terms',
    description: 'Assegna termini a un folio in una specifica tassonomia. Sostituisce tutti i termini precedenti di quella tassonomia. Usare term IDs, ottenibili con search_terms.',
    parameters: {
      type: 'object',
      required: ['folioId', 'vocabulary', 'termIds'],
      properties: {
        folioId:    { type: 'number', description: "ID del folio" },
        vocabulary: { type: 'string', description: "Slug della tassonomia (es. \"category\")" },
        termIds:    { type: 'array', items: { type: 'number' }, description: "Array di ID dei termini da assegnare (array vuoto per rimuovere tutti)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void; all(...a: unknown[]): unknown[] }
    } }).$client

    const voc = client.prepare(`SELECT id FROM vocabularies WHERE slug = ?`).get(input.vocabulary) as { id: number } | undefined
    if (!voc) return `Tassonomia "${input.vocabulary}" non trovata.`

    const folioExists = client.prepare(`SELECT id FROM folios WHERE id = ?`).get(input.folioId)
    if (!folioExists) return `Folio ID ${input.folioId} non trovato.`

    // Rimuove i vecchi termini di questa tassonomia per il folio
    const oldTerms = client.prepare(`
      SELECT ft.term_id FROM folio_terms ft
      JOIN terms t ON t.id = ft.term_id
      WHERE ft.folio_id = ? AND t.vocabulary_id = ?
    `).all(input.folioId, voc.id) as { term_id: number }[]

    for (const old of oldTerms) {
      client.prepare(`DELETE FROM folio_terms WHERE folio_id = ? AND term_id = ?`).run(input.folioId, old.term_id)
    }

    const termIds = (input.termIds as number[])
    for (const termId of termIds) {
      const termExists = client.prepare(`SELECT id FROM terms WHERE id = ? AND vocabulary_id = ?`).get(termId, voc.id)
      if (!termExists) continue  // salta termini non validi
      client.prepare(`INSERT OR IGNORE INTO folio_terms (folio_id, term_id) VALUES (?, ?)`).run(input.folioId, termId)
    }

    return `Termini aggiornati per folio ${input.folioId} nella tassonomia "${input.vocabulary}": ${termIds.length} termini assegnati.`
  },
}

// ─── Tool: list_users ─────────────────────────────────────────────────────────

const listUsersTool: AiTool = {
  definition: {
    name:        'list_users',
    description: 'Elenca gli utenti registrati nel sito con il loro ruolo.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: "Numero massimo di risultati (default 50)" },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(...a: unknown[]): unknown[] } } }).$client
    const limit = Math.min(Number(input.limit ?? 50), 200)
    const rows = client.prepare(`
      SELECT u.id, u.username, u.email, u.created_at, r.name as role_name, r.slug as role_slug
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ORDER BY u.id LIMIT ?
    `).all(limit) as { id: number; username: string; email: string; created_at: number; role_name: string | null; role_slug: string | null }[]

    if (rows.length === 0) return 'Nessun utente trovato.'
    return JSON.stringify(rows.map(u => ({
      id:       u.id,
      username: u.username,
      email:    u.email,
      role:     u.role_slug ? { name: u.role_name, slug: u.role_slug } : null,
    })), null, 2)
  },
}

// ─── Tool: create_vocabulary ──────────────────────────────────────────────────

const createVocabularyTool: AiTool = {
  definition: {
    name:        'create_vocabulary',
    description: 'Crea una nuova tassonomia (vocabulary) nel database. IMPORTANTE: per renderla permanente e visibile nell\'admin UI, deve essere aggiunta anche a phrasepress.config.ts. Senza quella aggiunta, la tassonomia sopravvive al riavvio nel DB ma le route API non la riconoscono.',
    parameters: {
      type: 'object',
      required: ['name', 'slug'],
      properties: {
        name:         { type: 'string', description: "Nome leggibile (es. \"Generi\")" },
        slug:         { type: 'string', description: "Identificatore URL-safe (es. \"genre\")" },
        hierarchical: { type: 'boolean', description: "Se true, i termini possono avere un parent (come le categorie). Default false (come i tag)." },
      },
    },
  },
  async execute(input, ctx) {
    const client = (ctx.db as unknown as { $client: {
      prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): void; all(...a: unknown[]): unknown[] }
    } }).$client

    const slug = String(input.slug).toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) return 'Slug non valido.'

    const existing = client.prepare(`SELECT id FROM vocabularies WHERE slug = ?`).get(slug)
    if (existing) return `Una tassonomia con slug "${slug}" esiste già.`

    const hierarchical = input.hierarchical ? 1 : 0
    client.prepare(`INSERT INTO vocabularies (name, slug, hierarchical) VALUES (?, ?, ?)`)
      .run(input.name, slug, hierarchical)

    const inserted = client.prepare(`SELECT id FROM vocabularies WHERE slug = ?`).get(slug) as { id: number }

    return JSON.stringify({
      id:           inserted.id,
      name:         input.name,
      slug,
      hierarchical: hierarchical === 1,
      warning:      `Tassonomia creata nel DB (ID ${inserted.id}). Per renderla permanente e visibile nell'admin UI, aggiungila a phrasepress.config.ts nella sezione "vocabularies": { name: "${input.name}", slug: "${slug}", codices: [...], hierarchical: ${hierarchical === 1} }`,
    }, null, 2)
  },
}

// ─── Tool: list_roles ─────────────────────────────────────────────────────────

const listRolesTool: AiTool = {
  definition: {
    name:        'list_roles',
    description: 'Elenca i ruoli disponibili nel sito con le loro capabilities.',
    parameters:  { type: 'object', properties: {} },
  },
  async execute(_input, ctx) {
    const client = (ctx.db as unknown as { $client: { prepare(sql: string): { all(): unknown[] } } }).$client
    const rows = client.prepare(`SELECT id, name, slug, capabilities FROM roles ORDER BY name`).all() as {
      id: number; name: string; slug: string; capabilities: string
    }[]
    if (rows.length === 0) return 'Nessun ruolo trovato.'
    return JSON.stringify(rows.map(r => ({
      id:           r.id,
      name:         r.name,
      slug:         r.slug,
      capabilities: JSON.parse(r.capabilities) as string[],
    })), null, 2)
  },
}

// ─── Export ────────────────────────────────────────────────────────────────────

export const ALL_TOOLS: AiTool[] = [
  // Panoramica sito
  getSiteInfoTool,
  // Folios (contenuto)
  readFolioTool,
  searchFoliosTool,
  writeFolioTool,
  createFolioTool,
  deleteFolioTool,
  getFolioRevisionsTool,
  // Tassonomie
  searchTermsTool,
  createTermTool,
  updateTermTool,
  deleteTermTool,
  getFolioTermsTool,
  setFolioTermsTool,
  createVocabularyTool,
  // Utenti e ruoli
  listUsersTool,
  listRolesTool,
  // File system
  readFileTool,
  writeFileTool,
  listFilesTool,
  // Plugin
  getPluginStatusTool,
]

export function getToolDefinitions(): ToolDefinition[] {
  return ALL_TOOLS.map(t => t.definition)
}

export async function executeTool(
  name:  string,
  input: Record<string, unknown>,
  ctx:   ToolContext,
): Promise<string> {
  const tool = ALL_TOOLS.find(t => t.definition.name === name)
  if (!tool) return `Tool sconosciuto: "${name}"`
  try {
    return await tool.execute(input, ctx)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Errore nell'esecuzione del tool "${name}": ${msg}`
  }
}

export function buildToolContext(
  db:                PluginContext['db'],
  settings:          AiSettings,
  configuredPlugins: string[],
  codices:           CodexSummary[],
): ToolContext {
  return { db, allowedPaths: settings.allowedPaths, configuredPlugins, codices }
}
