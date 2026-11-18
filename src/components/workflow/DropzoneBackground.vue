<script lang="ts" setup>
import { Background } from '@vue-flow/background'
import { useTheme } from 'vuetify'

const theme = useTheme()
const patternColor = computed(() => (theme.current.value.dark ? '#424242' : '#BDBDBD'))
</script>

<template>
  <div class="dropzone-background">
    <Background :size="2" :gap="20" :pattern-color="patternColor" />
    <div class="overlay">
      <slot />
    </div>
  </div>
</template>
