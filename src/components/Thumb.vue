<script setup>
import { ref, watch } from 'vue'
import { SOURCE_LABEL } from '../lib/recipes.js'

const props = defineProps({ recipe: { type: Object, required: true }, badge: Boolean })
const broken = ref(false)
watch(() => props.recipe.image, () => (broken.value = false))
</script>

<template>
  <div class="thumb" :class="`src-${props.recipe.source}`">
    <img
      v-if="props.recipe.image && !broken"
      :src="props.recipe.image"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="broken = true"
    />
    <span v-else class="thumb-fallback">{{ (props.recipe.title || '?').slice(0, 1) }}</span>
    <span v-if="props.badge" class="badge">{{ SOURCE_LABEL[props.recipe.source] }}</span>
  </div>
</template>
