import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'

const FROM_ADDRESS = '現場記録 <login@genbalog.com>'

/**
Resend経由でログイン用マジックリンクを送信する
 */
export async function sendMagicLinkEmail(email: string, loginUrl: string): Promise<void> {
  const config = useRuntimeConfig()
  const apiKey = config.resend.apiKey

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: 'メール送信(Resend)が設定されていません。RESEND_API_KEYを設定してください'
    })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: '現場トラッカー ログインリンク',
      html: `
        <p>以下のリンクをタップすると、この端末でログインできます（30分以内に有効）。</p>
        <p><a href="${loginUrl}">${loginUrl}</a></p>
        <p>このメールに心当たりがない場合は、無視してください。</p>
      `
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: 502,
      message: `メールの送信に失敗しました: ${text}`
    })
  }
}
