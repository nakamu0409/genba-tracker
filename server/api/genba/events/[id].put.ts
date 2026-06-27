import { createError, readBody } from 'h3'
import { updateGenbaEvent } from '../../../utils/genbaRepository'
import { parseGenbaEventInput } from '../../../utils/genbaValidation'

/**
現場更新 API
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const body = await readBody(event)
  const input = parseGenbaEventInput(body)

  const detail = await updateGenbaEvent(event.context.deviceId!, id, input)

  if (!detail) {
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  return detail
})
