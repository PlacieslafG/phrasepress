<template>
  <div class="border border-surface-200 rounded-lg overflow-hidden">
    <!-- Toolbar -->
    <div class="rte-toolbar flex flex-wrap items-center gap-0.5 p-1.5 border-b border-surface-200">
      <!-- Bold -->
      <button :class="tbBtn(editor?.isActive('bold'))" style="font-weight:700;font-family:serif"
        @click="editor?.chain().focus().toggleBold().run()">B</button>
      <!-- Italic -->
      <button :class="tbBtn(editor?.isActive('italic'))" style="font-style:italic;font-family:serif"
        @click="editor?.chain().focus().toggleItalic().run()">I</button>
      <!-- Link -->
      <button :class="tbBtn(editor?.isActive('link'))" @click="setLink">
        <i class="pi pi-link" />
      </button>

      <span class="w-px h-5 bg-surface-300 mx-0.5 shrink-0" />

      <button :class="tbBtn(editor?.isActive('heading', { level: 1 }))"
        @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">H1</button>
      <button :class="tbBtn(editor?.isActive('heading', { level: 2 }))"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
      <button :class="tbBtn(editor?.isActive('heading', { level: 3 }))"
        @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>

      <span class="w-px h-5 bg-surface-300 mx-0.5 shrink-0" />

      <button :class="tbBtn(editor?.isActive('bulletList'))"
        @click="editor?.chain().focus().toggleBulletList().run()">
        <i class="pi pi-list" />
      </button>
      <button :class="tbBtn(editor?.isActive('orderedList'))"
        @click="editor?.chain().focus().toggleOrderedList().run()">
        <i class="pi pi-list-check" />
      </button>
      <button :class="tbBtn(editor?.isActive('blockquote'))"
        @click="editor?.chain().focus().toggleBlockquote().run()">
        <i class="pi pi-code" />
      </button>

      <span class="w-px h-5 bg-surface-300 mx-0.5 shrink-0" />

      <button :class="tbBtn(false)" :disabled="!editor?.can().undo()"
        @click="editor?.chain().focus().undo().run()">
        <i class="pi pi-undo" />
      </button>
      <button :class="tbBtn(false)" :disabled="!editor?.can().redo()"
        @click="editor?.chain().focus().redo().run()">
        <i class="pi pi-forward" />
      </button>

      <span class="w-px h-5 bg-surface-300 mx-0.5 shrink-0" />

      <button :class="tbBtn(false)" @click="mediaPickerVisible = true">
        <i class="pi pi-image" />
      </button>
    </div>

    <!-- Editor area -->
    <EditorContent :editor="editor" class="prose max-w-none min-h-64 p-4 focus-within:outline-none" />

    <MediaPickerDialog v-model:visible="mediaPickerVisible" @select="insertImage" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import MediaPickerDialog from './MediaPickerDialog.vue'

const props = defineProps<{ modelValue: string }>()
const emit  = defineEmits<{ 'update:modelValue': [value: string] }>()

const mediaPickerVisible = ref(false)

function tbBtn(active: boolean | undefined) {
  return [
    'inline-flex items-center justify-center w-7 h-7 rounded text-sm transition-colors',
    'disabled:opacity-30 disabled:cursor-not-allowed',
    active
      ? 'rte-btn-active'
      : 'hover:bg-slate-100',
  ].join(' ')
}

function insertImage(url: string, alt: string) {
  editor.value?.chain().focus().setImage({ src: url, alt }).run()
}

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Image.configure({ inline: false, allowBase64: false }),
  ],
  onUpdate({ editor: e }) {
    emit('update:modelValue', e.getHTML())
  },
})

// Sync esterno (es. quando il post viene caricato)
watch(() => props.modelValue, (val) => {
  if (editor.value && editor.value.getHTML() !== val) {
    editor.value.commands.setContent(val, false)
  }
})

function setLink() {
  const prev = editor.value?.getAttributes('link').href ?? ''
  const url  = window.prompt('URL:', prev)
  if (url === null) return
  if (url === '') {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    editor.value?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
}

onBeforeUnmount(() => editor.value?.destroy())
</script>

<style>
.ProseMirror:focus { outline: none; }
.ProseMirror h1 { font-size: 1.5rem; font-weight: 700; margin: 0.75rem 0; }
.ProseMirror h2 { font-size: 1.25rem; font-weight: 700; margin: 0.75rem 0; }
.ProseMirror h3 { font-size: 1.125rem; font-weight: 600; margin: 0.5rem 0; }
.ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
.ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
.ProseMirror blockquote { border-left: 4px solid #94a3b8; padding-left: 1rem; font-style: italic; color: #94a3b8; margin: 0.5rem 0; }
.ProseMirror a { color: #6366f1; text-decoration: underline; }
.ProseMirror p { margin: 0.25rem 0; }
.ProseMirror img { max-width: 100%; height: auto; border-radius: 0.375rem; margin: 0.5rem 0; }

.rte-toolbar button { color: #334155; }
.dark .rte-toolbar button { color: #cbd5e1; }
.dark .rte-toolbar button:hover { background-color: #1e293b; }
.rte-btn-active { background-color: #d1fae5; color: #065f46; }
.dark .rte-btn-active { background-color: rgba(6,78,59,0.4); color: #6ee7b7; }
</style>
