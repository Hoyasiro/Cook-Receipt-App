<script setup>
import Thumb from './Thumb.vue'

const props = defineProps({ recipe: { type: Object, required: true } })
const emit = defineEmits(['open', 'edit', 'favorite'])
</script>

<template>
  <article class="card">
    <a class="card-link" :href="props.recipe.url" target="_blank" rel="noopener" @click="emit('open', props.recipe)">
      <Thumb :recipe="props.recipe" badge />
      <div class="card-text">
        <h3>{{ props.recipe.title || '이름 없는 레시피' }}</h3>
        <p class="meta">
          <span class="chip small">{{ props.recipe.category }}</span>
          <span v-if="props.recipe.memo" class="memo">{{ props.recipe.memo }}</span>
        </p>
      </div>
    </a>
    <div class="card-actions">
      <button
        class="icon-btn star"
        :class="{ on: props.recipe.favorite }"
        :aria-label="props.recipe.favorite ? '즐겨찾기 해제' : '즐겨찾기'"
        @click="emit('favorite', props.recipe)"
      >
        {{ props.recipe.favorite ? '★' : '☆' }}
      </button>
      <button class="icon-btn" aria-label="편집" @click="emit('edit', props.recipe)">⋯</button>
    </div>
  </article>
</template>
