<script setup>
defineProps({ title: { type: String, default: '' } })
const emit = defineEmits(['close'])
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet" role="dialog" :aria-label="title">
      <header class="sheet-head">
        <h2>{{ title }}</h2>
        <button class="icon-btn" aria-label="닫기" @click="emit('close')">✕</button>
      </header>
      <div class="sheet-body"><slot /></div>
    </section>
  </div>
</template>
