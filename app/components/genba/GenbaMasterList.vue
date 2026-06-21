<script setup lang="ts">
import type { GenbaMasterEntry, GenbaMasterType } from '../../../shared/types/genba'

const props = defineProps<{
  type: GenbaMasterType
  showGroupField?: boolean
  showPhoto?: boolean
  isAdmin: boolean
}>()

const entries = ref<GenbaMasterEntry[]>([])
const loading = ref(false)
const errorMessage = ref('')

const newName = ref('')
const newGroupName = ref('')
const submitting = ref(false)

const editingId = ref<number | null>(null)
const editName = ref('')
const editGroupName = ref('')

const showBulkImport = ref(false)
const bulkText = ref('')
const bulkSubmitting = ref(false)
const bulkResultMessage = ref('')

const fetchEntries = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    entries.value = await $fetch<GenbaMasterEntry[]>(`/api/genba/masters/${props.type}`)
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '取得に失敗しました'
  } finally {
    loading.value = false
  }
}

onMounted(fetchEntries)

const canModify = (entry: GenbaMasterEntry) => props.isAdmin || entry.scope === 'mine'

const addEntry = async () => {
  if (!newName.value.trim()) return

  submitting.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/genba/masters/${props.type}`, {
      method: 'post',
      body: { name: newName.value.trim(), groupName: newGroupName.value.trim() || null }
    })

    newName.value = ''
    newGroupName.value = ''
    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '登録に失敗しました'
  } finally {
    submitting.value = false
  }
}

const startEdit = (entry: GenbaMasterEntry) => {
  editingId.value = entry.id
  editName.value = entry.name
  editGroupName.value = entry.groupName ?? ''
}

const cancelEdit = () => {
  editingId.value = null
}

const saveEdit = async () => {
  if (editingId.value === null || !editName.value.trim()) return

  submitting.value = true
  errorMessage.value = ''

  try {
    await $fetch(`/api/genba/masters/${props.type}/${editingId.value}`, {
      method: 'put',
      body: { name: editName.value.trim(), groupName: editGroupName.value.trim() || null }
    })

    editingId.value = null
    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '更新に失敗しました'
  } finally {
    submitting.value = false
  }
}

const deleteEntry = async (id: number) => {
  const ok = confirm('削除しますか？')
  if (!ok) return

  errorMessage.value = ''

  try {
    await $fetch(`/api/genba/masters/${props.type}/${id}`, { method: 'delete' })
    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '削除に失敗しました'
  }
}

const photoInputRef = ref<HTMLInputElement | null>(null)
const photoTargetId = ref<number | null>(null)
const photoUploadingId = ref<number | null>(null)

const startPhotoUpload = (id: number) => {
  photoTargetId.value = id
  photoInputRef.value?.click()
}

const handlePhotoSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const id = photoTargetId.value

  if (!file || id === null) return

  photoUploadingId.value = id
  errorMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('photo', file)

    await $fetch(`/api/genba/idol-photos/${id}`, {
      method: 'post',
      body: formData
    })

    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '画像のアップロードに失敗しました'
  } finally {
    photoUploadingId.value = null
    input.value = ''
  }
}

const removePhoto = async (id: number) => {
  const ok = confirm('写真を削除しますか？')
  if (!ok) return

  errorMessage.value = ''

  try {
    await $fetch(`/api/genba/idol-photos/${id}`, { method: 'delete' })
    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '削除に失敗しました'
  }
}

const submitBulkImport = async () => {
  if (!bulkText.value.trim()) return

  bulkSubmitting.value = true
  errorMessage.value = ''
  bulkResultMessage.value = ''

  try {
    const result = await $fetch<{ created: number, skipped: number }>(`/api/genba/masters/${props.type}/bulk`, {
      method: 'post',
      body: { text: bulkText.value }
    })

    bulkResultMessage.value = `${result.created}件登録しました（重複などで${result.skipped}件スキップ）`
    bulkText.value = ''
    await fetchEntries()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '一括登録に失敗しました'
  } finally {
    bulkSubmitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <input
      v-if="showPhoto"
      ref="photoInputRef"
      type="file"
      accept="image/*"
      class="hidden"
      @change="handlePhotoSelected"
    >

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
    />

    <p class="text-xs text-muted">
      <template v-if="isAdmin">
        管理者として登録すると全員共有のデータになります。
      </template>
      <template v-else>
        ここで追加した名前は自分専用のデータとして保存され、他の人には共有されません（共有データは閲覧のみ可能です）。
      </template>
    </p>

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
        <UInput
          v-model="newName"
          placeholder="新しい名前を入力"
          class="flex-1"
          @keyup.enter="addEntry"
        />
        <UInput
          v-if="showGroupField"
          v-model="newGroupName"
          placeholder="所属グループ（任意）"
          class="flex-1"
          @keyup.enter="addEntry"
        />
        <UButton
          icon="i-lucide-plus"
          :loading="submitting"
          @click="addEntry"
        >
          追加
        </UButton>
      </div>
    </UCard>

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <button
        type="button"
        class="flex w-full items-center justify-between text-sm font-semibold"
        @click="showBulkImport = !showBulkImport"
      >
        <span class="flex items-center gap-2">
          <UIcon name="i-lucide-clipboard-list" />
          一括インポート
        </span>
        <UIcon :name="showBulkImport ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" />
      </button>

      <div
        v-if="showBulkImport"
        class="mt-3 flex flex-col gap-2"
      >
        <p class="text-xs text-muted">
          1行に1件、{{ showGroupField ? '「名前,所属グループ」の形式（グループは省略可）' : '名前のみ' }}で貼り付けてください。
        </p>
        <UTextarea
          v-model="bulkText"
          :placeholder="showGroupField ? '例:\n推しA,グループX\n推しB,グループY' : '例:\n会場A\n会場B'"
          class="w-full"
          :rows="5"
        />
        <UAlert
          v-if="bulkResultMessage"
          color="success"
          variant="soft"
          :title="bulkResultMessage"
        />
        <UButton
          icon="i-lucide-upload"
          :loading="bulkSubmitting"
          block
          @click="submitBulkImport"
        >
          まとめて登録
        </UButton>
      </div>
    </UCard>

    <div
      v-if="loading"
      class="py-6 text-center text-muted"
    >
      読み込み中...
    </div>

    <div
      v-else-if="entries.length === 0"
      class="py-6 text-center text-muted"
    >
      登録がありません
    </div>

    <div
      v-else
      class="flex flex-col gap-2"
    >
      <UCard
        v-for="entry in entries"
        :key="entry.id"
        :ui="{ body: 'p-3' }"
      >
        <div
          v-if="editingId === entry.id"
          class="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <UInput
            v-model="editName"
            class="flex-1"
          />
          <UInput
            v-if="showGroupField"
            v-model="editGroupName"
            placeholder="所属グループ"
            class="flex-1"
          />
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-check"
              :loading="submitting"
              @click="saveEdit"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              @click="cancelEdit"
            />
          </div>
        </div>

        <div
          v-else
          class="flex items-center justify-between gap-2"
        >
          <div class="flex items-center gap-3">
            <UAvatar
              v-if="showPhoto"
              :src="entry.photoUrl ?? undefined"
              icon="i-lucide-star"
              size="md"
            />

            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="font-medium">{{ entry.name }}</span>
                <UBadge
                  :color="entry.scope === 'shared' ? 'neutral' : 'primary'"
                  variant="subtle"
                  size="sm"
                >
                  {{ entry.scope === 'shared' ? '共有' : '自分用' }}
                </UBadge>
              </div>
              <span
                v-if="entry.groupName"
                class="text-xs text-muted"
              >{{ entry.groupName }}</span>
            </div>
          </div>

          <div
            v-if="canModify(entry)"
            class="flex gap-2"
          >
            <UButton
              v-if="showPhoto"
              icon="i-lucide-image-plus"
              variant="ghost"
              color="neutral"
              size="sm"
              :loading="photoUploadingId === entry.id"
              @click="startPhotoUpload(entry.id)"
            />
            <UButton
              v-if="showPhoto && entry.photoUrl"
              icon="i-lucide-image-off"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="removePhoto(entry.id)"
            />
            <UButton
              icon="i-lucide-pencil"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="startEdit(entry)"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="error"
              size="sm"
              @click="deleteEntry(entry.id)"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
