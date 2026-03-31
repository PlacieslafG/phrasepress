import type { PluginContext } from '@phrasepress/core'

type Db = PluginContext['db']

// ─── Tipi ────────────────────────────────────────────────────────────────────

export type AiProvider = 'openai' | 'anthropic' | 'ollama'

export interface AiSettings {
  provider:     AiProvider
  model:        string
  apiKey:       string
  baseUrl:      string
  systemPrompt: string
  allowedPaths: string[]  // percorsi filesystem autorizzati
}

export interface ConversationRow {
  id:             number
  userId:         number
  title:          string
  contextCodex:   string | null
  contextFolioId: number | null
  createdAt:      number
  updatedAt:      number
}

export interface MessageRow {
  id:             number
  conversationId: number
  role:           'user' | 'assistant' | 'tool' | 'tool_result'
  content:        string
  toolCalls:      string | null  // JSON
  toolCallId:     string | null
  createdAt:      number
}

// ─── Creazione tabelle ────────────────────────────────────────────────────────

export function createTables(db: Db): void {
  const client = (db as unknown as { $client: { exec(sql: string): void } }).$client
  client.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_settings (
      id            TEXT PRIMARY KEY DEFAULT 'default',
      provider      TEXT NOT NULL DEFAULT 'openai',
      model         TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      api_key       TEXT NOT NULL DEFAULT '',
      base_url      TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT 'You are a helpful assistant integrated into PhrasePress CMS.',
      allowed_paths TEXT NOT NULL DEFAULT '[]'
    );
    INSERT OR IGNORE INTO ai_chat_settings (id) VALUES ('default');

    CREATE TABLE IF NOT EXISTS ai_chat_conversations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL,
      title            TEXT NOT NULL DEFAULT 'Nuova conversazione',
      context_codex    TEXT,
      context_folio_id INTEGER,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL DEFAULT '',
      tool_calls      TEXT,
      tool_call_id    TEXT,
      created_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_chat_messages_conv_idx ON ai_chat_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS ai_chat_conversations_user_idx ON ai_chat_conversations(user_id);
  `)
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function dbGetSettings(db: Db): AiSettings {
  const client = (db as unknown as { $client: { prepare(sql: string): { get(...args: unknown[]): unknown } } }).$client
  const row = client.prepare('SELECT * FROM ai_chat_settings WHERE id = ?').get('default') as Record<string, unknown> | undefined
  if (!row) {
    return { provider: 'openai', model: 'gpt-4o-mini', apiKey: '', baseUrl: '', systemPrompt: '', allowedPaths: [] }
  }
  return {
    provider:     (row.provider as AiProvider) || 'openai',
    model:        (row.model as string) || 'gpt-4o-mini',
    apiKey:       (row.api_key as string) || '',
    baseUrl:      (row.base_url as string) || '',
    systemPrompt: (row.system_prompt as string) || '',
    allowedPaths: parseJson(row.allowed_paths as string, []),
  }
}

export function dbUpdateSettings(db: Db, s: Partial<AiSettings>): void {
  const current = dbGetSettings(db)
  const merged  = { ...current, ...s }
  const client  = (db as unknown as { $client: { prepare(sql: string): { run(...args: unknown[]): void } } }).$client
  client.prepare(`
    UPDATE ai_chat_settings SET
      provider      = ?,
      model         = ?,
      api_key       = ?,
      base_url      = ?,
      system_prompt = ?,
      allowed_paths = ?
    WHERE id = 'default'
  `).run(
    merged.provider,
    merged.model,
    merged.apiKey,
    merged.baseUrl,
    merged.systemPrompt,
    JSON.stringify(merged.allowedPaths),
  )
}

// ─── Conversations ────────────────────────────────────────────────────────────

export function dbCreateConversation(db: Db, params: {
  userId:         number
  title?:         string
  contextCodex:   string | null
  contextFolioId: number | null
}): ConversationRow {
  const now    = Date.now()
  const title  = params.title ?? 'Nuova conversazione'
  const client = (db as unknown as { $client: {
    prepare(sql: string): { run(...args: unknown[]): void; get(...args: unknown[]): unknown }
  } }).$client

  client.prepare(`
    INSERT INTO ai_chat_conversations (user_id, title, context_codex, context_folio_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(params.userId, title, params.contextCodex, params.contextFolioId, now, now)

  const row = client.prepare(`
    SELECT * FROM ai_chat_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(params.userId) as ConversationRow

  return row
}

export function dbListConversations(db: Db, userId: number): ConversationRow[] {
  const client = (db as unknown as { $client: { prepare(sql: string): { all(...args: unknown[]): unknown[] } } }).$client
  return client.prepare(`
    SELECT * FROM ai_chat_conversations WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId) as ConversationRow[]
}

export function dbGetConversation(db: Db, id: number, userId: number): ConversationRow | null {
  const client = (db as unknown as { $client: { prepare(sql: string): { get(...args: unknown[]): unknown } } }).$client
  return (client.prepare(`
    SELECT * FROM ai_chat_conversations WHERE id = ? AND user_id = ?
  `).get(id, userId) as ConversationRow | undefined) ?? null
}

export function dbUpdateConversationTitle(db: Db, id: number, title: string): void {
  const client = (db as unknown as { $client: { prepare(sql: string): { run(...args: unknown[]): void } } }).$client
  client.prepare(`UPDATE ai_chat_conversations SET title = ?, updated_at = ? WHERE id = ?`).run(title, Date.now(), id)
}

export function dbDeleteConversation(db: Db, id: number, userId: number): void {
  const client = (db as unknown as { $client: { prepare(sql: string): { run(...args: unknown[]): void } } }).$client
  client.prepare(`DELETE FROM ai_chat_conversations WHERE id = ? AND user_id = ?`).run(id, userId)
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function dbAddMessage(db: Db, msg: {
  conversationId: number
  role:           'user' | 'assistant' | 'tool' | 'tool_result'
  content:        string
  toolCalls?:     unknown[]
  toolCallId?:    string
}): MessageRow {
  const now    = Date.now()
  const client = (db as unknown as { $client: {
    prepare(sql: string): { run(...args: unknown[]): void; get(...args: unknown[]): unknown }
  } }).$client

  client.prepare(`
    INSERT INTO ai_chat_messages (conversation_id, role, content, tool_calls, tool_call_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    msg.conversationId,
    msg.role,
    msg.content,
    msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    msg.toolCallId ?? null,
    now,
  )

  client.prepare(`UPDATE ai_chat_conversations SET updated_at = ? WHERE id = ?`).run(now, msg.conversationId)

  return client.prepare(`
    SELECT * FROM ai_chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1
  `).get(msg.conversationId) as MessageRow
}

export function dbListMessages(db: Db, conversationId: number): MessageRow[] {
  const client = (db as unknown as { $client: { prepare(sql: string): { all(...args: unknown[]): unknown[] } } }).$client
  return client.prepare(`
    SELECT * FROM ai_chat_messages WHERE conversation_id = ? ORDER BY id ASC
  `).all(conversationId) as MessageRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
