<template>
  <div class="exist-badge-wrap" aria-hidden="true">
    <span class="exist-badge">
      <VIcon icon="mdi-check-bold" size="12" />
    </span>
  </div>
</template>

<style scoped>
.exist-badge-wrap {
  position: absolute;
  z-index: 3;
  inset-block-start: 7px;
  inset-inline-end: 7px;
  pointer-events: none;
}

.exist-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(74, 222, 128, 0.45);
  border-radius: 6px;
  background: rgba(16, 185, 129, 0.94);
  block-size: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  color: #fff;
  inline-size: 20px;
}
</style>
