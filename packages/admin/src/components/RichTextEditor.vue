<template>
  <div class="border border-surface-200 rounded-lg overflow-hidden">
    <!-- Toolbar -->
    <div class="flex flex-wrap gap-1 p-2 border-b border-surface-200 bg-surface-50">
      <Button text rounded size="small" icon="pi pi-bold"
        :severity="editor?.isActive('bold') ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleBold().run()" />
      <Button text rounded size="small" icon="pi pi-italic"
        :severity="editor?.isActive('italic') ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleItalic().run()" />
      <Button text rounded size="small" icon="pi pi-link"
        :severity="editor?.isActive('link') ? 'primary' : 'secondary'"
        @click="setLink" />
      <Divider layout="vertical" class="mx-1 h-6" />
      <Button text rounded size="small" label="H1"
        :severity="editor?.isActive('heading', { level: 1 }) ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()" />
      <Button text rounded size="small" label="H2"
        :severity="editor?.isActive('heading', { level: 2 }) ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()" />
      <Button text rounded size="small" label="H3"
        :severity="editor?.isActive('heading', { level: 3 }) ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" />
      <Divider layout="vertical" class="mx-1 h-6" />
      <Button text rounded size="small" icon="pi pi-list"
        :severity="editor?.isActive('bulletList') ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleBulletList().run()" />
      <Button text rounded size="small" icon="pi pi-list-check"
        :severity="editor?.isActive('orderedList') ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleOrderedList().run()" />
      <Button text rounded size="small" icon="pi pi-comment"
        :severity="editor?.isActive('blockquote') ? 'primary' : 'secondary'"
        @click="editor?.chain().focus().toggleBlockquote().run()" />
      <Divider layout="vertical" class="mx-1 h-6" />
      <Button text rounded size="small" icon="pi pi-undo" severity="secondary"
        :disabled="!editor?.can().undo()"
        @click="editor?.chain().focus().undo().run()" />
      <Button text rounded size="small" icon="pi pi-redo" severity="secondary"
        :disabled="!editor?.can().redo()"
        @click="editor?.chain().focus().redo().run()" />
      <Divider layout="vertical" class="mx-1 h-6" />
      <Button text rounded size="small" icon="pi pi-image" severity="secondary"
        v-tooltip="'Inserisci immagine'"
        @click="mediaPickerVisible = true" />
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
</style>
