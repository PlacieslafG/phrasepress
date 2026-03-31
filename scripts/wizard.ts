/**
 * PhrasePress Setup Wizard
 * Interactive CLI to configure .env, (optionally) phrasepress.config.ts,
 * run DB migrations and launch the dev/prod servers.
 *
 * Usage: pnpm setup
 */

import * as readline from 'readline/promises'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as childProcess from 'child_process'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')

const ENV_FILE = path.join(ROOT, '.env')
const ENV_EXAMPLE = path.join(ROOT, '.env.example')
const CONFIG_FILE = path.join(ROOT, 'config', 'phrasepress.config.ts')
const DATA_DIR = path.join(ROOT, 'data')
const UPLOADS_DIR = path.join(ROOT, 'data', 'uploads')

// ---------------------------------------------------------------------------
// ANSI colours (no external deps)
// ---------------------------------------------------------------------------

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
}

const clr = (color: string, text: string) => `${color}${text}${c.reset}`
const bold = (text: string) => clr(c.bold, text)
const dim = (text: string) => clr(c.dim, text)
const green = (text: string) => clr(c.green, text)
const yellow = (text: string) => clr(c.yellow, text)
const red = (text: string) => clr(c.red, text)
const cyan = (text: string) => clr(c.cyan, text)
const magenta = (text: string) => clr(c.magenta, text)
const blue = (text: string) => clr(c.blue, text)

// ---------------------------------------------------------------------------
// Readline helpers
// ---------------------------------------------------------------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function ask(prompt: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue !== undefined ? dim(` [${defaultValue}]`) : ''
  const answer = await rl.question(`  ${prompt}${suffix}: `)
  return answer.trim() || defaultValue || ''
}

async function askYesNo(prompt: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = await rl.question(`  ${prompt} ${dim(`[${hint}]`)}: `)
  const trimmed = answer.trim().toLowerCase()
  if (trimmed === '') return defaultYes
  return trimmed === 'y' || trimmed === 'yes'
}

function print(text: string) {
  process.stdout.write(text + '\n')
}

function printLine(char = '─', width = 60) {
  print(dim(char.repeat(width)))
}

function printSection(title: string) {
  print('')
  print(clr(c.cyan + c.bold, `▸ ${title}`))
  printLine()
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function printBanner() {
  print('')
  print(clr(c.cyan + c.bold, '╔══════════════════════════════════════════════════════════╗'))
  print(clr(c.cyan + c.bold, '║                                                          ║'))
  print(clr(c.cyan + c.bold, '║         PhrasePress  ·  Setup Wizard                     ║'))
  print(clr(c.cyan + c.bold, '║                                                          ║'))
  print(clr(c.cyan + c.bold, '╚══════════════════════════════════════════════════════════╝'))
  print('')
  print(dim('  This wizard will guide you through the initial configuration'))
  print(dim('  of PhrasePress and launch the backend + admin UI.'))
  print('')
}

// ---------------------------------------------------------------------------
// Prerequisites check
// ---------------------------------------------------------------------------

function checkPrerequisites() {
  printSection('Prerequisites')

  // Node version
  const [major] = process.versions.node.split('.').map(Number)
  if (major < 22) {
    print(red(`  ✗  Node.js ${process.versions.node} detected — Node 22+ is required.`))
    process.exit(1)
  }
  print(green(`  ✓  Node.js ${process.versions.node}`))

  // pnpm
  try {
    const version = childProcess.execSync('pnpm --version', { encoding: 'utf8' }).trim()
    print(green(`  ✓  pnpm ${version}`))
  } catch {
    print(yellow('  ⚠  pnpm not found — install it with: npm i -g pnpm'))
  }
}

// ---------------------------------------------------------------------------
// .env helpers
// ---------------------------------------------------------------------------

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    result[key] = val
  }
  return result
}

function serializeEnv(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
}

function genSecret() {
  return crypto.randomBytes(32).toString('hex')
}

// ---------------------------------------------------------------------------
// Collect .env values
// ---------------------------------------------------------------------------

async function collectEnvValues(isDev: boolean): Promise<Record<string, string>> {
  printSection('Environment Configuration')

  const port = await ask('Backend port', '3000')
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    print(red('  Invalid port number.'))
    process.exit(1)
  }

  let adminPassword = ''
  while (adminPassword.length < 8) {
    adminPassword = await ask('Admin password (min 8 characters)')
    if (adminPassword.length < 8) {
      print(yellow('  Password must be at least 8 characters. Try again.'))
    }
  }

  // JWT secrets
  const autoJwt = genSecret()
  print('')
  print(`  ${cyan('JWT Secret')} ${dim('(signs short-lived access tokens)')}:`)
  print(dim(`  → ${autoJwt}`))
  const jwtAnswer = await ask('  Press Enter to use this value, or type a custom secret')
  const jwtSecret = jwtAnswer || autoJwt
  print(green('  ✓  JWT_SECRET set'))

  const autoRefresh = genSecret()
  print('')
  print(`  ${cyan('JWT Refresh Secret')} ${dim('(signs httpOnly cookie refresh tokens — must differ from JWT Secret)')}:`)
  print(dim(`  → ${autoRefresh}`))
  const refreshAnswer = await ask('  Press Enter to use this value, or type a custom secret')
  const jwtRefreshSecret = refreshAnswer || autoRefresh
  print(green('  ✓  JWT_REFRESH_SECRET set'))

  print('')
  const dbPath = await ask('Database path', './data/phrasepress.db')

  let corsOrigin: string
  let domain: string | undefined

  if (isDev) {
    corsOrigin = await ask('CORS origin (admin URL)', 'http://localhost:5173')
  } else {
    domain = await ask('Production domain (e.g. example.com)')
    if (!domain) {
      print(red('  Domain is required in production mode.'))
      process.exit(1)
    }
    corsOrigin = `https://${domain}`
    print(dim(`  CORS origin set to ${corsOrigin}`))
  }

  const env: Record<string, string> = {
    DATABASE_PATH: dbPath,
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
    ADMIN_PASSWORD: adminPassword,
    PORT: port,
    NODE_ENV: isDev ? 'development' : 'production',
    CORS_ORIGIN: corsOrigin,
  }

  if (domain) {
    env.DOMAIN = domain
  }

  return env
}

// ---------------------------------------------------------------------------
// phrasepress.config.ts generation
// ---------------------------------------------------------------------------

const ALL_PLUGINS = ['media', 'fields', 'forms', 'mailer', 'i18n', 'db-monitor', 'ai'] as const
type PluginName = (typeof ALL_PLUGINS)[number]

const PLUGIN_IMPORT: Record<PluginName, string> = {
  media: `(await import('../packages/plugins/media/src/index.js')).default`,
  fields: `(await import('../packages/plugins/fields/src/index.js')).default`,
  forms: `(await import('../packages/plugins/forms/src/index.js')).default`,
  mailer: `(await import('../packages/plugins/mailer/src/index.js')).default`,
  i18n: `(await import('../packages/plugins/i18n/src/index.js')).default`,
  'db-monitor': `(await import('../packages/plugins/db-monitor/src/index.js')).default`,
  ai: `(await import('../packages/plugins/ai/src/index.js')).default`,
}

async function configurePluginsAndTypes(): Promise<PluginName[]> {
  printSection('Plugins, Codici & Vocabolari')

  // Plugin selection
  print('  Plugin disponibili:')
  const PLUGIN_DESCRIPTIONS: Record<PluginName, string> = {
    media:        'Gestione media e upload file',
    fields:       'Tipi di campo avanzati',
    forms:        'Form builder con validazione',
    mailer:       'Invio email transazionali',
    i18n:         'Supporto multilingua',
    'db-monitor': 'Monitor query e performance DB',
    ai:           'Chat AI integrata nell\'admin con tool per gestire contenuti',
  }
  ALL_PLUGINS.forEach((p, i) => print(`    ${cyan(String(i + 1))}. ${p}  ${dim(PLUGIN_DESCRIPTIONS[p])}`))
  print('')
  const pluginAnswer = await ask('Abilita plugin (numeri separati da virgola, "all" o "none")', 'all')

  let selectedPlugins: PluginName[]
  if (pluginAnswer.toLowerCase() === 'all') {
    selectedPlugins = [...ALL_PLUGINS]
  } else if (pluginAnswer.toLowerCase() === 'none') {
    selectedPlugins = []
  } else {
    const indices = pluginAnswer.split(',').map(s => parseInt(s.trim(), 10) - 1)
    selectedPlugins = indices
      .filter(i => i >= 0 && i < ALL_PLUGINS.length)
      .map(i => ALL_PLUGINS[i])
    if (selectedPlugins.length === 0) {
      print(yellow('  Nessun indice valido — nessun plugin abilitato.'))
    }
  }

  print(green(`  Selezionati: ${selectedPlugins.length > 0 ? selectedPlugins.join(', ') : 'nessuno'}`))

  // Custom codex
  print('')
  const addCodex = await askYesNo('Aggiungere un codice personalizzato (es. product, event)?', false)
  let codexName = ''
  let codexLabel = ''
  if (addCodex) {
    codexName  = await ask('Nome codex (es. product, event)')
    codexLabel = await ask('Label codex (es. Products, Events)')
    if (!codexName) {
      print(yellow('  Nome vuoto — codex personalizzato saltato.'))
      codexName = ''
    }
  }

  // Generate config
  const pluginImports = selectedPlugins
    .map(p => `    ${PLUGIN_IMPORT[p]},`)
    .join('\n')

  const extraCodexBlock =
    codexName
      ? `
    {
      name: '${codexName}',
      label: '${codexLabel || codexName}',
      icon: 'pi-box',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title', type: 'string', label: 'Titolo', queryable: true, required: true },
        { name: 'slug',  type: 'slug',   label: 'Slug',   slugSource: 'title' },
        // Aggiungi altri campi qui:
        // { name: 'price', type: 'number', label: 'Prezzo', queryable: true },
      ],
      displayField: 'title',
    },`
      : `
    // Aggiungi altri codici qui:
    // {
    //   name: 'product', label: 'Products', icon: 'pi-box',
    //   stages: DEFAULT_STAGES,
    //   blueprint: [
    //     { name: 'title', type: 'string', label: 'Titolo', queryable: true, required: true },
    //     { name: 'slug',  type: 'slug',   label: 'Slug',   slugSource: 'title' },
    //     { name: 'price', type: 'number', label: 'Prezzo', queryable: true },
    //   ],
    //   displayField: 'title',
    // },`

  const extraVocabularyBlock = codexName
    ? `
    // { slug: 'genre', name: 'Genres', codices: ['${codexName}'], hierarchical: true },`
    : `
    // Aggiungi altri vocabolari qui:
    // { slug: 'genre', name: 'Genres', codices: ['product'], hierarchical: true },`

  const configContent = `import { defineConfig } from '../packages/core/src/config.js'

const DEFAULT_STAGES = [
  { name: 'draft',     label: 'Bozza',      initial: true },
  { name: 'published', label: 'Pubblicato' },
  { name: 'trash',     label: 'Cestino',    final: true  },
]

export default defineConfig({
  codices: [
    {
      name: 'post', label: 'Posts', icon: 'pi-file-edit',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content', type: 'richtext', label: 'Contenuto' },
      ],
      displayField: 'title',
    },
    {
      name: 'page', label: 'Pages', icon: 'pi-file-o',
      stages: DEFAULT_STAGES,
      blueprint: [
        { name: 'title',   type: 'string',   label: 'Titolo',    queryable: true, required: true },
        { name: 'slug',    type: 'slug',     label: 'Slug',      slugSource: 'title' },
        { name: 'content', type: 'richtext', label: 'Contenuto' },
      ],
      displayField: 'title',
    },${extraCodexBlock}
  ],

  vocabularies: [
    { slug: 'category', name: 'Categories', codices: ['post'], hierarchical: true  },
    { slug: 'tag',       name: 'Tags',       codices: ['post'], hierarchical: false },${extraVocabularyBlock}
  ],

  plugins: [
${pluginImports}
  ],
})
`

  await backupConfigIfExists()
  await fs.writeFile(CONFIG_FILE, configContent, 'utf8')
  print(green(`  ✓  phrasepress.config.ts aggiornato`))
  return selectedPlugins
}

// ---------------------------------------------------------------------------
// Run a command with live prefixed output
// ---------------------------------------------------------------------------

function runCommand(
  cmd: string,
  args: string[],
  label: string,
  labelColor: string,
  cwd = ROOT,
): Promise<void> {
  return new Promise((resolve, reject) => {
    print(`\n${labelColor}[${label}]${c.reset} Running: ${dim(`${cmd} ${args.join(' ')}`)}\n`)

    const proc = childProcess.spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    const prefix = `${labelColor}[${label}]${c.reset} `

    proc.stdout.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) process.stdout.write(prefix + line + '\n')
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) process.stderr.write(prefix + dim(line) + '\n')
      }
    })

    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`'${cmd} ${args.join(' ')}' exited with code ${code}`))
    })

    proc.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// Setup actions: dirs, install, build (prod), migrate
// ---------------------------------------------------------------------------

async function runSetupActions(isDev: boolean) {
  printSection('Setup Actions')

  // Ensure data directories
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  print(green('  ✓  data/ and data/uploads/ directories ready'))

  // pnpm install
  await runCommand('pnpm', ['install'], 'install', c.blue)

  // Build (production only)
  if (!isDev) {
    await runCommand('pnpm', ['build'], 'build', c.magenta)
  }

  // DB migrate
  await runCommand('pnpm', ['db:migrate'], 'migrate', c.green)
}

// ---------------------------------------------------------------------------
// Dev launch: two processes with prefixed output, SIGINT handler
// ---------------------------------------------------------------------------

function launchDev(port: string) {
  printSection('Launching Development Servers')
  print(dim('  Press Ctrl+C to stop all processes.\n'))

  const coreProc = childProcess.spawn('pnpm', ['dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  const adminProc = childProcess.spawn('pnpm', ['dev:admin'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  const corePrefix = `${c.cyan}[core]${c.reset}  `
  const adminPrefix = `${c.magenta}[admin]${c.reset} `

  function pipeOutput(proc: childProcess.ChildProcess, prefix: string) {
    proc.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) process.stdout.write(prefix + line + '\n')
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) process.stderr.write(prefix + dim(line) + '\n')
      }
    })
    proc.on('error', err => {
      process.stderr.write(prefix + red(`Process error: ${err.message}`) + '\n')
    })
  }

  pipeOutput(coreProc, corePrefix)
  pipeOutput(adminProc, adminPrefix)

  function shutdown() {
    print('\n' + yellow('  Stopping processes…'))
    if (!coreProc.killed) coreProc.kill('SIGTERM')
    if (!adminProc.killed) adminProc.kill('SIGTERM')
    setTimeout(() => {
      print(green('  Goodbye! 👋'))
      process.exit(0)
    }, 500)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  coreProc.on('close', code => {
    if (code !== null && code !== 0) {
      process.stderr.write(corePrefix + red(`Exited with code ${code}`) + '\n')
    }
  })
  adminProc.on('close', code => {
    if (code !== null && code !== 0) {
      process.stderr.write(adminPrefix + red(`Exited with code ${code}`) + '\n')
    }
  })

  // Summary
  print('')
  print(bold('  ┌─ Servers starting…'))
  print(`  │  ${cyan('Backend')}  → ${bold(`http://localhost:${port}`)}`)
  print(`  │  ${magenta('Admin UI')} → ${bold('http://localhost:5173')}`)
  print(`  └─ ${dim('(may take a few seconds to be ready)')}`)
  print('')
}

// ---------------------------------------------------------------------------
// Production launch
// ---------------------------------------------------------------------------

async function launchProduction() {
  printSection('Production Launch')

  // Check pm2
  let pm2Available = false
  try {
    childProcess.execSync('pm2 --version', { encoding: 'utf8' })
    pm2Available = true
  } catch {
    pm2Available = false
  }

  if (pm2Available) {
    const usePm2 = await askYesNo('Start with pm2?', true)
    if (usePm2) {
      await runCommand('pm2', ['start', 'ecosystem.config.cjs', '--env', 'production'], 'pm2', c.green)
      print('')
      print(green('  ✓  PhrasePress started via pm2'))
      print(dim('     Use pm2 logs phrasepress to view logs'))
      print(dim('     Use pm2 stop phrasepress to stop'))
      return
    }
  } else {
    print(yellow('  ⚠  pm2 not found — install it with: npm i -g pm2'))
  }

  print('')
  print(bold('  Alternative: run with Docker Compose'))
  print(dim('  ┌─────────────────────────────────────┐'))
  print(dim('  │  docker compose up -d               │'))
  print(dim('  └─────────────────────────────────────┘'))
  print('')
  print(dim('  Or start the compiled server directly:'))
  print(dim('  ┌─────────────────────────────────────┐'))
  print(dim('  │  node packages/core/dist/server.js  │'))
  print(dim('  └─────────────────────────────────────┘'))
}

// ---------------------------------------------------------------------------
// Config backup helper
// ---------------------------------------------------------------------------

async function backupConfigIfExists(): Promise<void> {
  if (!fsSync.existsSync(CONFIG_FILE)) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = path.join(ROOT, 'config', `phrasepress.config.backup-${timestamp}.ts`)
  await fs.copyFile(CONFIG_FILE, backupPath)
  print(yellow('  ⚠  phrasepress.config.ts esiste già — backup creato:'))
  print(dim(`     ${backupPath}`))
}

// ---------------------------------------------------------------------------
// Template selection
// ---------------------------------------------------------------------------

const CONFIG_TEMPLATES = [
  { label: 'Blog',                description: 'Blog classico con post, pagine, categorie e tag',                   file: 'blog.ts' },
  { label: 'Knowledge Base',      description: 'Articoli KB, guide e release notes con workflow di review',         file: 'knowledge-base.ts' },
  { label: 'Portfolio / Agenzia', description: 'Progetti, servizi e testimonial per studi creativi',                file: 'portfolio.ts' },
  { label: 'E-commerce / Catalogo', description: 'Catalogo prodotti con SKU, prezzi, disponibilità e recensioni', file: 'ecommerce.ts' },
  { label: 'Testata Editoriale',  description: 'Articoli news, editoriali e workflow di pubblicazione',             file: 'news.ts' },
  { label: 'Sito Aziendale',      description: 'Pagine, team, case study e servizi per siti corporate',             file: 'corporate.ts' },
] as const

async function selectTemplate(): Promise<void> {
  printSection('Template di partenza')

  print('  Scegli una configurazione preimpostata per phrasepress.config.ts:')
  print('')
  CONFIG_TEMPLATES.forEach((t, i) => {
    print(`    ${cyan(String(i + 1))}. ${bold(t.label)}`)
    print(`       ${dim(t.description)}`)
  })
  const fromScratch = CONFIG_TEMPLATES.length + 1
  print(`    ${cyan(String(fromScratch))}. ${bold('Configura da zero')}  ${dim('(nessun template applicato)')}`)
  print('')

  const answer = await ask('Scelta', String(fromScratch))
  const choice = parseInt(answer, 10)

  if (isNaN(choice) || choice < 1 || choice > fromScratch) {
    print(yellow('  Scelta non valida — nessun template applicato.'))
    return
  }

  if (choice === fromScratch) {
    print(dim('  Configurazione da zero — nessun template applicato.'))
    return
  }

  const selected = CONFIG_TEMPLATES[choice - 1]
  const templatePath = path.join(ROOT, 'config', 'templates', selected.file)
  const templateContent = await fs.readFile(templatePath, 'utf8')

  // Adjust the import path: templates use '../../packages/', config/ uses '../packages/'
  const configContent = templateContent.replace(
    /from '\.\.\/\.\.\//g,
    "from '../"
  )

  await backupConfigIfExists()
  await fs.writeFile(CONFIG_FILE, configContent, 'utf8')
  print(green(`  ✓  Template "${selected.label}" applicato a phrasepress.config.ts`))
  print(dim('     Puoi personalizzarlo ulteriormente durante il prossimo step.'))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  printBanner()
  checkPrerequisites()

  // ── Template selection ────────────────────────────────────────────────────
  await selectTemplate()

  // ── Existing .env check ──────────────────────────────────────────────────
  let envExists = fsSync.existsSync(ENV_FILE)
  let skipEnvConfig = false

  if (envExists) {
    print('')
    print(yellow('  A .env file already exists.'))
    const reconfigure = await askYesNo('Reconfigure it?', false)
    if (!reconfigure) {
      skipEnvConfig = true
      print(dim('  Keeping existing .env'))
    }
  }

  // ── Mode selection ───────────────────────────────────────────────────────
  let isDev = true
  if (!skipEnvConfig) {
    printSection('Mode')
    const modeAnswer = await ask('Mode?  1 = Development   2 = Production', '1')
    isDev = modeAnswer !== '2'
    print(green(`  Selected: ${isDev ? 'Development' : 'Production'}`))
  } else {
    // Read mode from existing .env
    const existing = parseEnv(await fs.readFile(ENV_FILE, 'utf8'))
    isDev = existing.NODE_ENV !== 'production'
    print(dim(`  Mode from existing .env: ${isDev ? 'development' : 'production'}`))
  }

  // ── Env configuration ────────────────────────────────────────────────────
  let envVars: Record<string, string> = {}
  if (!skipEnvConfig) {
    envVars = await collectEnvValues(isDev)
    await fs.writeFile(ENV_FILE, serializeEnv(envVars), 'utf8')
    print('')
    print(green('  ✓  .env written'))
  } else {
    envVars = parseEnv(await fs.readFile(ENV_FILE, 'utf8'))
  }

  const port = envVars.PORT || '3000'

  // ── phrasepress.config.ts (optional) ─────────────────────────────────────
  print('')
  const configureTs = await askYesNo('Configurare plugin, codici e vocabolari in phrasepress.config.ts?', false)
  let selectedPlugins: PluginName[] = []
  if (configureTs) {
    selectedPlugins = await configurePluginsAndTypes()
  }

  // ── Setup actions ─────────────────────────────────────────────────────────
  await runSetupActions(isDev)

  // ── AI plugin hint ────────────────────────────────────────────────────────
  if (selectedPlugins.includes('ai')) {
    print('')
    printSection('Plugin AI — configurazione')
    print(`  Il plugin ${cyan('phrasepress-ai')} è stato abilitato.`)
    print(`  Per attivarlo e configurarlo:`)
    print(`    ${dim('1.')} Apri l'admin UI → sezione ${bold('Plugin')} → attiva ${cyan('phrasepress-ai')}`)
    print(`    ${dim('2.')} Vai su ${bold('Impostazioni AI')} e configura:`)
    print(`       ${dim('•')} Provider (Ollama / OpenAI / Anthropic)`)
    print(`       ${dim('•')} Modello e URL base (es. http://localhost:11434 per Ollama)`)
    print(`       ${dim('•')} Percorsi autorizzati per i file tool (opzionale)`)
    print(`    ${dim('3.')} Clicca l'icona ${bold('✦')} in basso a destra per aprire la chat`)
    print('')
    print(dim('  Documentazione Ollama: https://ollama.com/library'))
  }

  // ── Launch ────────────────────────────────────────────────────────────────
  rl.close()
  if (isDev) {
    launchDev(port)
    // process stays alive — child processes keep it running
  } else {
    await launchProduction()
  }
}

main().catch(err => {
  process.stderr.write(red(`\n  Fatal error: ${err.message}\n`))
  rl.close()
  process.exit(1)
})
