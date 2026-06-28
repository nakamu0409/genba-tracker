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
推しを選択・新規作成したときに、マスタに登録済みの所属グループ・前回の単価があれば一緒に反映する
 */
const applyIdolSelection = (index: number, name: string) => {
  const matched = props.idols.find(idol => idol.name === name)
  const current = props.modelValue[index]

  updateRow(index, {
    memberName: name || null,
    ...(matched?.groupName ? { groupDraft: matched.groupName } : {}),
    ...(matched?.lastUnitPrice && current?.unitPrice === 0 ? { unitPrice: matched.lastUnitPrice } : {})
  })
}

const incrementQuantity = (index: number) => {
  const current = props.modelValue[index]
  if (!current) return
  updateRow(index, { quantity: current.quantity + 1 })
}

const decrementQuantity = (index: number) => {
  const current = props.modelValue[index]
  if (!current) return
  updateRow(index, { quantity: Math.max(1, current.quantity - 1) })
}

// 前回単価が分かっている(=使ったことがある)推しを優先して、ワンタップ追加の候補にする
const quickAddIdols = computed(() => {
  return [...props.idols]
    .sort((a, b) => (b.lastUnitPrice !== null ? 1 : 0) - (a.lastUnitPrice !== null ? 1 : 0))
    .slice(0, 8)
})

const quickAddIdol = (idol: GenbaMasterEntry) => {
  emit('update:modelValue', [
    ...props.modelValue,
    { label: '', unitPrice: idol.lastUnitPrice ?? 0, quantity: 1, memberName: idol.name, groupDraft: idol.groupName }
  ])
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

    <div
      v-if="quickAddIdols.length > 0"
      class="mb-3 flex gap-3 overflow-x-auto pb-1"
    >
      <button
        v-for="idol in quickAddIdols"
        :key="idol.id"
        type="button"
        class="flex flex-shrink-0 flex-col items-center gap-1"
        @click="quickAddIdol(idol)"
      >
        <UAvatar
          :src="idol.photoUrl ?? undefined"
          icon="i-lucide-star"
          size="md"
        />
        <span class="max-w-14 truncate text-[11px] text-muted">{{ idol.name }}</span>
      </button>
    </div>

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
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-minus"
                variant="soft"
                color="neutral"
                size="sm"
                @click="decrementQuantity(index)"
              />
              <UInput
                :model-value="item.quantity"
                type="number"
                min="1"
                class="noSpinner w-full text-center"
                @update:model-value="(v) => updateRow(index, { quantity: Number(v) })"
              />
              <UButton
                icon="i-lucide-plus"
                variant="soft"
                color="neutral"
                size="sm"
                @click="incrementQuantity(index)"
              />
            </div>
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

<style scoped>
.noSpinner :deep(input[type='number'])::-webkit-outer-spin-button,
.noSpinner :deep(input[type='number'])::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.noSpinner :deep(input[type='number']) {
  -moz-appearance: textfield;
}
</style>
