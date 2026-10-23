<script setup lang="ts">
withDefaults(defineProps<{ orbs?: boolean }>(), { orbs: true })
</script>
<template>
  <div class="aero-decor" aria-hidden="true">
    <div class="aero-gloss absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/60 to-white/10 group-hover:from-white/80 group-hover:to-white/20"
      :class="orbs ? 'rounded-t-3xl' : 'rounded-t-full'"></div>
    <div v-if="orbs" class="aero-orb aero-orb-green absolute -top-16 -right-16 w-40 h-40 rounded-full bg-green-400/20 blur-3xl group-hover:scale-150 group-hover:bg-green-300/30 transition-all duration-500 ease-out"></div>
    <div v-if="orbs" class="aero-orb aero-orb-sky absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-sky-400/20 blur-3xl group-hover:scale-150 group-hover:bg-sky-300/30 transition-all duration-500 ease-out"></div>
  </div>
</template>
