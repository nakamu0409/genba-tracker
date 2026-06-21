import { readBody } from 'h3'
import { createGenbaEvent } from '../../utils/genbaRepository'
import { parseGenbaEventInput } from '../../utils/genbaValidation'

/**
現場登録 API
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const input = parseGenbaEventInput(body)

  return createGenbaEvent(event.context.deviceId!, input)
})
