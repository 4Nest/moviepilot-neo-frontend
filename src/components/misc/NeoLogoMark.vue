<script setup lang="ts">
/** NEO 品牌图标：currentColor 描边/填充，随文字颜色与主题联动 */
defineOptions({ name: 'NeoLogoMark' })
</script>

<template>
  <svg
    class="neo-logo-mark"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    fill="none"
    role="img"
    aria-label="MoviePilot Neo"
  >
    <path
      d="M63 397V136C63 116 86 105 102 117L256 237L410 117C426 105 449 116 449 136V397"
      stroke="currentColor"
      stroke-width="54"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M98 423V360C98 329 121 310 153 310C186 310 209 331 209 363V423H177V363C177 346 168 338 153 338C139 338 130 347 130 363V423H98Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M263 310C230 310 208 334 208 367C208 401 232 424 266 424C286 424 303 417 315 404L294 385C286 394 276 398 265 398C251 398 241 391 237 380H317C318 376 318 372 318 367C318 333 296 310 263 310ZM237 359C240 345 250 337 263 337C276 337 285 345 289 359H237Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M375 310C341 310 316 334 316 367C316 401 341 424 375 424C410 424 435 401 435 367C435 334 410 310 375 310ZM375 339C392 339 403 350 403 367C403 384 392 395 375 395C358 395 347 384 347 367C347 350 358 339 375 339Z"
      fill="currentColor"
    />
  </svg>
</template>

<style scoped>
.neo-logo-mark {
  display: inline-block;
}
</style>
