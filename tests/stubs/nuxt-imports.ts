/**
vitest実行時に `#imports`（Nuxtの自動import）を解決するためのスタブ。
テストではgetGenbaDbをモックするため、実際に呼ばれることはない想定
 */
export function useRuntimeConfig(): never {
  throw new Error('useRuntimeConfigはテストでは使えません（getGenbaDbをモックしてください）')
}
