/**
ユーザー添付ファイルアップロード API（Nuxt BFF）
 *
【役割】
・フロントから受け取った multipart/form-data を Spring Boot に中継する
 */
export default defineEventHandler(async (event) => {
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required'
    })
  }

  const formData = await readFormData(event)

  const authToken = getCookie(event, 'auth_token')

  return await $fetch(`http://localhost:8080/api/users/${id}/upload`, {
    method: 'POST',
    headers: {
      Authorization: authToken || ''
    },
    body: formData
  })
})
