<template>
  <div class="p-6 max-w-4xl">
    <h1 class="text-2xl font-bold mb-6">Impostazioni Mailer</h1>

    <!-- ─── SMTP Config ─────────────────────────────────────────────────────── -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Configurazione SMTP</h2>
        <div class="flex gap-2">
          <Button
            label="Testa invio"
            icon="pi pi-send"
            severity="secondary"
            size="small"
            :disabled="!settings.host"
            @click="testDialogVisible = true"
          />
          <Button label="Salva" icon="pi pi-check" size="small" :loading="savingSettings" @click="saveSettings" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Server SMTP</label>
          <InputText v-model="settings.host" placeholder="smtp.example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Porta</label>
          <InputNumber v-model="settings.port" :min="1" :max="65535" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Nome mittente</label>
          <InputText v-model="settings.fromName" placeholder="Il Mio Sito" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Email mittente</label>
          <InputText v-model="settings.fromEmail" placeholder="no-reply@example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Utente SMTP</label>
          <InputText v-model="settings.authUser" placeholder="utente@example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">
            Password SMTP
            <span v-if="settings.hasPassword" class="text-xs font-normal text-surface-400 ml-1">(salvata — lascia vuoto per mantenerla)</span>
          </label>
          <Password v-model="newPassword" placeholder="••••••••" toggle-mask :feedback="false" input-class="w-full" class="w-full" />
        </div>
        <div class="flex items-center gap-2 col-span-2">
          <ToggleSwitch v-model="settings.secure" input-id="secure-toggle" />
          <label for="secure-toggle" class="text-sm cursor-pointer">Connessione sicura (TLS/SSL)</label>
        </div>
      </div>
    </div>

    <!-- ─── Notification Rules ──────────────────────────────────────────────── -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Regole di notifica</h2>
        <Button label="Aggiungi regola" icon="pi pi-plus" size="small" @click="openNotificationDialog()" />
      </div>

      <DataTable :value="notifications" :loading="loadingNotifications" striped-rows class="w-full">
        <template #empty>
          <div class="text-center py-8 text-surface-400">Nessuna regola configurata.</div>
        </template>

        <Column header="Form">
          <template #body="{ data: n }: { data: NotificationRule }">
            {{ formName(n.formId) }}
          </template>
        </Column>
        <Column field="toEmail" header="Destinatario" />
        <Column field="subjectTemplate" header="Oggetto" />
        <Column header="Attiva" style="width: 90px">
          <template #body="{ data: n }: { data: NotificationRule }">
            <ToggleSwitch :modelValue="n.enabled" @update:modelValue="toggleEnabled(n, $event)" />
          </template>
        </Column>
        <Column header="Azioni" style="width: 100px">
          <template #body="{ data: n }: { data: NotificationRule }">
            <div class="flex gap-1">
              <Button icon="pi pi-pencil" text plain size="small" v-tooltip="'Modifica'" @click="openNotificationDialog(n)" />
              <Button icon="pi pi-trash" text plain size="small" severity="danger" v-tooltip="'Elimina'" @click="confirmDeleteNotification(n)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- ─── Dialog: test invio ─────────────────────────────────────────────── -->
    <Dialog v-model:visible="testDialogVisible" header="Testa invio email" modal :style="{ width: '380px' }">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-surface-500">Inserisci l'indirizzo a cui inviare un'email di prova.</p>
        <InputText v-model="testEmail" placeholder="test@example.com" class="w-full" />
      </div>
      <template #footer>
        <Button label="Annulla" text @click="testDialogVisible = false" />
        <Button label="Invia" icon="pi pi-send" :loading="sendingTest" @click="sendTestEmail" />
      </template>
    </Dialog>

    <!-- ─── Dialog: aggiungi/modifica notifica ─────────────────────────────── -->
    <Dialog
      v-model:visible="notifDialogVisible"
      :header="editingNotif ? 'Modifica regola' : 'Nuova regola'"
      modal
      :style="{ width: '480px' }"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Form</label>
          <Select
            v-model="notifForm.formId"
            :options="forms"
            option-label="name"
            option-value="id"
            placeholder="Seleziona un form"
            class="w-full"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Email destinatario</label>
          <InputText v-model="notifForm.toEmail" placeholder="admin@example.com" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Oggetto email</label>
          <InputText v-model="notifForm.subjectTemplate" placeholder="Nuova submission: {form_name}" class="w-full" />
          <span class="text-xs text-surface-400">Usa <code>{form_name}</code> per il nome del form.</span>
        </div>
        <div class="flex items-center gap-2">
          <ToggleSwitch v-model="notifForm.enabled" input-id="notif-enabled" />
          <label for="notif-enabled" class="text-sm cursor-pointer">Attiva</label>
        </div>
      </div>
      <template #footer>
        <Button label="Annulla" text @click="notifDialogVisible = false" />
        <Button label="Salva" :loading="savingNotif" @click="saveNotification" />
      </template>
    </Dialog>

    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import {
  getMailerSettings,
  updateMailerSettings,
  testMailer,
  getMailerNotifications,
  createMailerNotification,
  updateMailerNotification,
  deleteMailerNotification,
  type SmtpSettings,
  type NotificationRule,
} from '@/api/mailer.js'
import { getForms, type Form } from '@/api/forms.js'

const toast   = useToast()
const confirm = useConfirm()

// ─── State ─────────────────────────────────────────────────────────────────────

const settings         = ref<SmtpSettings>({ host: '', port: 587, secure: false, fromName: '', fromEmail: '', authUser: '', hasPassword: false })
const newPassword      = ref('')
const savingSettings   = ref(false)
const loadingNotifications = ref(false)
const notifications    = ref<NotificationRule[]>([])
const forms            = ref<Form[]>([])

// test dialog
const testDialogVisible = ref(false)
const testEmail         = ref('')
const sendingTest       = ref(false)

// notification dialog
const notifDialogVisible = ref(false)
const editingNotif       = ref<NotificationRule | null>(null)
const savingNotif        = ref(false)
const notifForm          = ref({ formId: '', toEmail: '', subjectTemplate: 'Nuova submission: {form_name}', enabled: true })

// ─── Init ──────────────────────────────────────────────────────────────────────

onMounted(async () => {
  const [s, n, f] = await Promise.all([
    getMailerSettings(),
    (loadingNotifications.value = true, getMailerNotifications()),
    getForms(),
  ])
  settings.value       = s
  notifications.value  = n
  loadingNotifications.value = false
  forms.value          = f
})

// ─── Settings ─────────────────────────────────────────────────────────────────

async function saveSettings() {
  savingSettings.value = true
  try {
    const updated = await updateMailerSettings({
      host:      settings.value.host,
      port:      settings.value.port,
      secure:    settings.value.secure,
      fromName:  settings.value.fromName,
      fromEmail: settings.value.fromEmail,
      authUser:  settings.value.authUser,
      ...(newPassword.value ? { authPass: newPassword.value } : {}),
    })
    settings.value  = updated
    newPassword.value = ''
    toast.add({ severity: 'success', summary: 'Salvato', detail: 'Impostazioni SMTP aggiornate', life: 3000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile salvare le impostazioni', life: 4000 })
  } finally {
    savingSettings.value = false
  }
}

// ─── Test email ───────────────────────────────────────────────────────────────

async function sendTestEmail() {
  if (!testEmail.value) return
  sendingTest.value = true
  try {
    await testMailer(testEmail.value)
    toast.add({ severity: 'success', summary: 'Inviata', detail: `Email di prova inviata a ${testEmail.value}`, life: 3000 })
    testDialogVisible.value = false
    testEmail.value = ''
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Invio fallito. Controlla le impostazioni SMTP.', life: 5000 })
  } finally {
    sendingTest.value = false
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

function formName(formId: string): string {
  return forms.value.find(f => f.id === formId)?.name ?? formId
}

function openNotificationDialog(n?: NotificationRule) {
  if (n) {
    editingNotif.value = n
    notifForm.value    = { formId: n.formId, toEmail: n.toEmail, subjectTemplate: n.subjectTemplate, enabled: n.enabled }
  } else {
    editingNotif.value = null
    notifForm.value    = { formId: '', toEmail: '', subjectTemplate: 'Nuova submission: {form_name}', enabled: true }
  }
  notifDialogVisible.value = true
}

async function saveNotification() {
  if (!notifForm.value.formId || !notifForm.value.toEmail) {
    toast.add({ severity: 'warn', summary: 'Campi obbligatori', detail: 'Seleziona un form e inserisci l\'email', life: 3000 })
    return
  }
  savingNotif.value = true
  try {
    if (editingNotif.value) {
      const updated = await updateMailerNotification(editingNotif.value.id, notifForm.value)
      const idx = notifications.value.findIndex(n => n.id === editingNotif.value!.id)
      if (idx !== -1) notifications.value[idx] = updated
    } else {
      const created = await createMailerNotification(notifForm.value)
      notifications.value.push(created)
    }
    notifDialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Salvato', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', detail: 'Impossibile salvare la regola', life: 4000 })
  } finally {
    savingNotif.value = false
  }
}

async function toggleEnabled(n: NotificationRule, value: boolean) {
  try {
    const updated = await updateMailerNotification(n.id, { ...n, enabled: value })
    const idx = notifications.value.findIndex(x => x.id === n.id)
    if (idx !== -1) notifications.value[idx] = updated
  } catch {
    toast.add({ severity: 'error', summary: 'Errore', life: 3000 })
  }
}

function confirmDeleteNotification(n: NotificationRule) {
  confirm.require({
    message:       `Eliminare la regola per "${formName(n.formId)}"?`,
    header:        'Conferma eliminazione',
    icon:          'pi pi-exclamation-triangle',
    rejectLabel:   'Annulla',
    acceptLabel:   'Elimina',
    acceptClass:   'p-button-danger',
    accept: async () => {
      await deleteMailerNotification(n.id)
      notifications.value = notifications.value.filter(x => x.id !== n.id)
      toast.add({ severity: 'success', summary: 'Eliminata', life: 2000 })
    },
  })
}
</script>
