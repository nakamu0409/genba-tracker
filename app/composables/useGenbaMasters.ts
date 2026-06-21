import type { GenbaMasterEntry, GenbaMasterType } from '../../shared/types/genba'

/**
会場・アイドル・グループのマスタ一覧を取得し、新規入力値を裏側で登録する composable
 *
共有データと自分の端末専用データを合わせた一覧を、現場登録フォームの入力候補として利用する
 */
export const useGenbaMasters = () => {
  const venues = ref<GenbaMasterEntry[]>([])
  const idols = ref<GenbaMasterEntry[]>([])
  const groups = ref<GenbaMasterEntry[]>([])

  const fetchMasters = async () => {
    const [venueList, idolList, groupList] = await Promise.all([
      $fetch<GenbaMasterEntry[]>('/api/genba/masters/venues'),
      $fetch<GenbaMasterEntry[]>('/api/genba/masters/idols'),
      $fetch<GenbaMasterEntry[]>('/api/genba/masters/groups')
    ])

    venues.value = venueList
    idols.value = idolList
    groups.value = groupList
  }

  /**
入力された名前がマスタに無ければ裏側で登録し、候補一覧へ反映する
   */
  const ensureMasterEntry = async (type: GenbaMasterType, name: string, groupName: string | null = null) => {
    const trimmed = name.trim()
    if (!trimmed) return

    const list = type === 'venues' ? venues : type === 'idols' ? idols : groups

    if (list.value.some(entry => entry.name === trimmed)) {
      return
    }

    try {
      const created = await $fetch<GenbaMasterEntry>(`/api/genba/masters/${type}`, {
        method: 'post',
        body: { name: trimmed, groupName }
      })

      list.value = [...list.value, created].sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      // 同名登録の競合などは無視し、入力値自体は使えるようにする
    }
  }

  return {
    venues,
    idols,
    groups,
    fetchMasters,
    ensureMasterEntry
  }
}
