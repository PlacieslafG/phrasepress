import { ref, readonly, shallowRef } from 'vue'

const TIMEOUT_MS        = 30_000
const RELOADING_DELAY   = 800

// ─── Dialog configuration types ───────────────────────────────────────────────

export interface RestartDialogStep {
  label:        string
  description?: string
}

export interface RestartDialogSteps {
  /** Step mostrato durante l'operazione che precede il riavvio (opzionale). */
  initial?:    RestartDialogStep
  /** Step "riavvio server" — label e descrizione personalizzabili. */
  restarting?: { label?: string; description?: string }
  /** Step finale prima del completamento — label e descrizione personalizzabili. */
  reloading?:  { label?: string; description?: string }
}

export interface RestartDialogOptions {
  title?:  string
  footer?: string
  steps?:  RestartDialogSteps
}

// ─── Singleton state (condiviso tra tutte le istanze del composable) ──────────

const waitingRestart = ref(false)

let _pollTimer: ReturnType<typeof setTimeout> | null = null
let _cancelled = false

const _dialogVisible = ref(false)
const _dialogTitle   = ref('Riavvio server')
const _dialogFooter  = ref('Non chiudere questa finestra.')
const _dialogPhase   = ref<'initial' | 'restarting' | 'reloading'>('restarting')
const _dialogSteps   = shallowRef<RestartDialogSteps>({})

// ─── Helpers interni ──────────────────────────────────────────────────────────

function _applyDialogConfig(opts: RestartDialogOptions): void {
  _dialogTitle.value  = opts.title  ?? 'Riavvio server'
  _dialogFooter.value = opts.footer ?? 'Non chiudere questa finestra.'
  _dialogSteps.value  = opts.steps  ?? {}
}

function _clearTimer(): void {
  if (_pollTimer !== null) { clearTimeout(_pollTimer); _pollTimer = null }
}

function _closeDialog(): void {
  waitingRestart.value = false
  _dialogVisible.value = false
  _clearTimer()
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Composable riutilizzabile per rilevare il riavvio del server via bootId.
 * Gestisce anche un modale di progressione condiviso, configurabile dal chiamante.
 *
 * Uso base (con modale):
 *   const { captureBootId, showInitialPhase, pollUntilRestarted } = useServerRestart()
 *
 *   showInitialPhase({ title: 'Ripristino backup', steps: { initial: { label: 'Ripristino dati' } } })
 *   await longOperation()
 *   pollUntilRestarted(bootId, { dialog: {}, onRestarted: () => reload() })
 *
 * Uso senza fase iniziale (il modale si apre direttamente in 'restarting'):
 *   await quickOperation()
 *   pollUntilRestarted(bootId, { dialog: { title: 'Attivazione plugin' }, onRestarted })
 */
export function useServerRestart() {

  async function captureBootId(): Promise<string | null> {
    try {
      const res  = await fetch('/api/v1/health')
      const body = await res.json() as { bootId?: string }
      return body.bootId ?? null
    } catch { return null }
  }

  /**
   * Apre il modale in fase 'initial' prima dell'operazione lenta.
   * Chiamare PRIMA del blocco API che causa il riavvio (es. restoreBackup).
   */
  function showInitialPhase(opts: RestartDialogOptions): void {
    _applyDialogConfig(opts)
    _dialogPhase.value   = 'initial'
    _dialogVisible.value = true
    waitingRestart.value = true
  }

  /**
   * Avvia il polling per rilevare il riavvio del server.
   * Se viene passata l'opzione `dialog`, mostra/aggiorna il modale condiviso.
   */
  function pollUntilRestarted(
    bootIdBefore: string | null,
    callbacks: {
      onRestarted:  () => void | Promise<void>
      onTimeout?:   () => void
      /** Se fornito, mostra/aggiorna il modale di progressione. */
      dialog?:      RestartDialogOptions
    },
  ): void {
    _clearTimer()
    _cancelled = false
    waitingRestart.value = true

    if (callbacks.dialog !== undefined) {
      if (!_dialogVisible.value) {
        // Nessuna fase initial: apri il dialog direttamente in 'restarting'
        _applyDialogConfig(callbacks.dialog)
        _dialogVisible.value = true
      }
      // Transisci a 'restarting' che sia da 'initial' o da appena aperto
      _dialogPhase.value = 'restarting'
    }

    const pollStart = Date.now()

    const poll = async (): Promise<void> => {
      if (_cancelled) return

      if (Date.now() - pollStart > TIMEOUT_MS) {
        _closeDialog()
        if (callbacks.onTimeout) callbacks.onTimeout()
        return
      }

      let bootIdNow: string | null = null
      try {
        const res  = await fetch('/api/v1/health')
        const body = await res.json() as { bootId?: string }
        bootIdNow = body.bootId ?? null
      } catch { /* server sta riavviando — normale */ }

      if (bootIdNow !== null && bootIdNow !== bootIdBefore) {
        if (_dialogVisible.value) {
          _dialogPhase.value = 'reloading'
          await new Promise<void>(r => setTimeout(r, RELOADING_DELAY))
          _dialogVisible.value = false
        }
        waitingRestart.value = false
        await callbacks.onRestarted()
      } else {
        _pollTimer = setTimeout(poll, 1000)
      }
    }

    // Piccolo delay iniziale per dare tempo a nodemon di rilevare il file modificato
    _pollTimer = setTimeout(poll, 1000)
  }

  function cancel(): void {
    _cancelled = true
    _closeDialog()
  }

  return {
    /** `true` mentre il polling è attivo — utile per disabilitare pulsanti. */
    waitingRestart,
    captureBootId,
    showInitialPhase,
    pollUntilRestarted,
    cancel,

    // ─── Dialog state (letto da ServerRestartDialog.vue) ─────────────────────
    dialogVisible: _dialogVisible,
    dialogTitle:   readonly(_dialogTitle),
    dialogFooter:  readonly(_dialogFooter),
    dialogPhase:   readonly(_dialogPhase),
    dialogSteps:   readonly(_dialogSteps),
  }
}
