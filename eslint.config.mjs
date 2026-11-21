// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // 検証用の使い捨てスクリプトは整形ルールの対象外にする
  { ignores: ['kabu-lens/research/**'] }
)
