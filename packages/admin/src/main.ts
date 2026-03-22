import { createApp }  from 'vue'
import { createPinia } from 'pinia'
import PrimeVue        from 'primevue/config'
import Aura            from '@primevue/themes/aura'
import ToastService    from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import 'primeicons/primeicons.css'
import '@/assets/main.css'

import Button          from 'primevue/button'
import Card            from 'primevue/card'
import Checkbox        from 'primevue/checkbox'
import Column          from 'primevue/column'
import ConfirmDialog   from 'primevue/confirmdialog'
import DataTable       from 'primevue/datatable'
import DatePicker      from 'primevue/datepicker'
import Dialog          from 'primevue/dialog'
import Divider         from 'primevue/divider'
import InputNumber     from 'primevue/inputnumber'
import InputText       from 'primevue/inputtext'
import Message         from 'primevue/message'
import MultiSelect     from 'primevue/multiselect'
import Panel           from 'primevue/panel'
import Password        from 'primevue/password'
import ProgressSpinner from 'primevue/progressspinner'
import RadioButton     from 'primevue/radiobutton'
import Select          from 'primevue/select'
import Tag             from 'primevue/tag'
import Textarea        from 'primevue/textarea'
import Toast           from 'primevue/toast'
import Tooltip         from 'primevue/tooltip'
import ToggleSwitch    from 'primevue/toggleswitch'

import App    from './App.vue'
import router from './router/index.js'
import { initApiFetch } from '@/api/client.js'
import { useAuthStore } from '@/stores/auth.js'
import { useThemeStore } from '@/stores/theme.js'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)

// Connette apiFetch allo store auth DOPO che Pinia è attivo, ma PRIMA
// che il router monti e la guard beforeEach chiami fetchMe.
// Questo rompe il ciclo di import:
// client.ts → stores/auth.ts → api/auth.ts → client.ts
const auth = useAuthStore()
initApiFetch({
  getToken:     () => auth.accessToken,
  doRefresh:    () => auth.refreshToken(),
  clearSession: () => auth.clearSession(),
})

app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: { darkModeSelector: '.dark' },
  },
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

app.component('Button',          Button)
app.component('Card',            Card)
app.component('Checkbox',        Checkbox)
app.component('Column',          Column)
app.component('ConfirmDialog',   ConfirmDialog)
app.component('DataTable',       DataTable)
app.component('DatePicker',      DatePicker)
app.component('Dialog',          Dialog)
app.component('Divider',         Divider)
app.component('InputNumber',     InputNumber)
app.component('InputText',       InputText)
app.component('Message',         Message)
app.component('MultiSelect',     MultiSelect)
app.component('Panel',           Panel)
app.component('Password',        Password)
app.component('ProgressSpinner', ProgressSpinner)
app.component('RadioButton',     RadioButton)
app.component('Select',          Select)
app.component('Tag',             Tag)
app.component('Textarea',        Textarea)
app.component('Toast',           Toast)
app.component('ToggleSwitch',    ToggleSwitch)

// Inizializza preferenze tema (dark mode + colore primario)
useThemeStore().init()

app.mount('#app')
