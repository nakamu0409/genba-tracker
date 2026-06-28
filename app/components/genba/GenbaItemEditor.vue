<script setup lang="ts">
import type { GenbaItemInput, GenbaMasterEntry } from '../../../shared/types/genba'

export type GenbaItemFormState = GenbaItemInput & { groupDraft: string | null }

const props = defineProps<{
  modelValue: GenbaItemFormState[]
  label: string
  icon: string
  idols: GenbaMasterEntry[]
  groups: GenbaMasterEntry[]
  requireMember?: boolean
  showLabel?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: GenbaItemFormState[]]
}>()

// コンボボックスへ新規作成した名前は、確定前でもitemsに含めて選択状態を維持できるようにする
const extraIdolNames = ref<string[]>([])
const extraGroupNames = ref<string[]>([])

const idolItems = computed(() => [...new Set([...props.idols.map(i => i.name), ...extraIdolNames.value])])
const groupItems = computed(() => [...new Set([...props.groups.map(g => g.name), ...extraGroupNames.value])])

const subtotal = computed(() => {
  return props.modelValue.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
})

const addRow = () => {
  emit('update:modelValue', [
    ...props.modelValue,
    { label: '', unitPrice: 0, quantity: 1, memberName: null, groupDraft: null }
  ])
}

const removeRow = (index: number) => {
  const next = props.modelValue.slice()
  next.splice(index, 1)
  emit('update:modelValue', next)
}

const updateRow = (index: number, patch: Partial<GenbaItemFormState>) => {
  const next = props.modelValue.slice()
  next[index] = { ...next[index], ...patch } as GenbaItemFormState
  emit('update:modelValue', next)
}

/**
推しを選択・新規作成したときに、マスタに登録済みの所属グループがあれば一緒に反映する
 */
const applyIdolSelection = (index: number, name: string) => {
  const matched = props.idols.find(idol => idol.name === name)

  updateRow(index, {
    memberName: name || null,
    ...(matched?.groupName ? { groupDraft: matched.groupName } : {})
  })
}

const handleCreateIdol = (index: number, name: string) => {
  if (!extraIdolNames.value.includes(name)) {
    extraIdolNames.value = [...extraIdolNames.value, name]
  }
  applyIdolSelection(index, name)
}

const handleCreateGroup = (index: number, name: string) => {
  if (!extraGroupNames.value.includes(name)) {
    extraGroupNames.value = [...extraGroupNames.value, name]
  }
  updateRow(index, { groupDraft: name })
}
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4' }">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 font-semibold">
          <UIcon
            :name="icon"
            class="text-lg"
          />
          {{ label }}
        </div>
        <span class="text-sm text-muted">小計 ¥{{ subtotal.toLocaleString() }}</span>
      </div>
    </template>

    <div class="flex flex-col gap-3">
      <div
        v-for="(item, index) in modelValue"
        :key="index"
        class="flex flex-col gap-2 rounded-lg border border-default p-3"
      >
        <div
          v-if="showLabel"
          class="flex items-end gap-2"
        >
          <UFormField
            label="項目名"
            class="flex-1"
          >
            <UInput
              :model-value="item.label"
              placeholder="例: メンチェキA"
              class="w-full"
              @update:model-value="(v) => updateRow(index, { label: String(v) })"
            />
          </UFormField>

          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeRow(index)"
          />
        </div>

        <div class="flex items-end gap-2">
          <UFormField
            :label="requireMember ? '推し（必須）' : '推し'"
            class="flex-1"
          >
            <UInputMenu
              :model-value="item.memberName ?? ''"
              :items="idolItems"
              create-item="always"
              placeholder="アイドル名"
              class="w-full"
              :color="requireMember && !item.memberName ? 'error' : undefined"
              @update:model-value="(v) => applyIdolSelection(index, String(v))"
              @create="(v) => handleCreateIdol(index, v)"
            />
          </UFormField>

          <UFormField
            label="グループ"
            class="flex-1"
          >
            <UInputMenu
              :model-value="item.groupDraft ?? ''"
              :items="groupItems"
              create-item="always"
              placeholder="任意"
              class="w-full"
              @update:model-value="(v) => updateRow(index, { groupDraft: String(v) || null })"
              @create="(v) => handleCreateGroup(index, v)"
            />
          </UFormField>

          <UButton
            v-if="!showLabel"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="sm"
            @click="removeRow(index)"
          />
        </div>

        <div class="grid grid-cols-3 items-end gap-2">
          <UFormField label="単価">
            <UInput
              :model-value="item.unitPrice"
              type="number"
              min="0"
              step="100"
              class="w-full"
              @update:model-value="(v) => updateRow(index, { unitPrice: Number(v) })"
            />
          </UFormField>

          <UFormField label="数量">
            <UInput
              :model-value="item.quantity"
              type="number"
              min="1"
              class="w-full"
              @update:model-value="(v) => updateRow(index, { quantity: Number(v) })"
            />
          </UFormField>

          <span class="pb-2 text-right text-sm font-semibold text-highlighted">
            ¥{{ (item.unitPrice * item.quantity).toLocaleString() }}
          </span>
        </div>
      </div>

      <UButton
        icon="i-lucide-plus"
        variant="soft"
        block
        @click="addRow"
      >
        {{ label }}を追加
      </UButton>
    </div>
  </UCard>
</template>
