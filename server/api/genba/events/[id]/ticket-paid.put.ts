import { createError, readBody } from 'h3'
import { setTicketPaid } from '../../../../utils/genbaRepository'

/**
チケットの支払い状況だけを切り替える
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const body = await readBody(event)
  const ticketPaid = Boolean(body?.ticketPaid)

  const updated = await setTicketPaid(event.context.deviceId!, id, ticketPaid)

  if (!updated) {
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  return { ticketPaid }
})
