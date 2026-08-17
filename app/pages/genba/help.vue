<script setup lang="ts">
definePageMeta({
  layout: 'genba'
})

const sections = [
  {
    icon: 'i-lucide-circle-plus',
    title: '現場を記録する',
    body: '「登録」タブから、イベント名・会場・チケット/ドリンク/交通/宿泊などの費用、チェキやグッズを入力します。会場やイベント名、推しの名前は過去の入力から候補が出るので、2回目以降はタップだけで済みます。推しのワンタップ追加や、前回の単価の自動入力にも対応しています。'
  },
  {
    icon: 'i-lucide-calendar-clock',
    title: '「予定」の現場',
    body: '未来の日付で登録すると「予定」として扱われ、バッジが付きます。チケット代など分かっている金額を入れておくと、予算の先読み（これから使う予定分）に反映されます。開催日が過ぎると自動的に通常の記録になります。集計・年間まとめには予定は含まれません。'
  },
  {
    icon: 'i-lucide-circle-dollar-sign',
    title: '前もって払った分の管理',
    body: '先行抽選のチケットや、事前に予約した交通・宿、先に買ったチェキなどは「支払い済み」に切り替えられます。予定の現場では、チケット・交通・宿は費用欄の下のトグルで、チェキ・グッズは明細ごと（メンバーごと）に切り替えできます。支払い済みにした分は「これから使う予定分」から外れます。'
  },
  {
    icon: 'i-lucide-wallet',
    title: '予算',
    body: '記録タブの「月別」やカレンダーで、その月の予算を設定できます。「毎月の予算として使う」にチェックすると、設定していない月にも自動で適用されます。使用額・残り・これから使う予定分が一目で分かります。'
  },
  {
    icon: 'i-lucide-calendar',
    title: 'カレンダー',
    body: '月ごとに現場を一覧できます。日付をタップするとその日の現場が下に表示され、「この日に登録」から素早く記録できます。予算バーで使いすぎ具合も確認できます。'
  },
  {
    icon: 'i-lucide-image',
    title: 'チェキの写真',
    body: '現場の詳細ページから、撮ったチェキの写真を保存できます。登録時にまとめて添付することもできます。写真はタップで拡大表示、いつでも削除できます。'
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'まとめ・診断・実績',
    body: '記録タブの「⋮」から、月間まとめ・年間まとめ・実績を見られます。まとめには支出や推しランキング・満足度が出て、そのままSNSにシェア画像を作れます。実績では現場回数やチェキ枚数などのバッジを集められます。'
  },
  {
    icon: 'i-lucide-filter',
    title: '絞り込みと集計',
    body: '記録タブや集計タブで、推し・グループごとに絞り込めます。絞り込むと、その推しだけの金額・チェキ枚数が表示されます。集計タブでは推し別の累計・月別の支出を確認できます。'
  },
  {
    icon: 'i-lucide-settings-2',
    title: 'マスタ管理',
    body: 'アカウント → マスタ管理から、会場・アイドル・グループを登録・編集・削除できます。アイドルには写真を設定でき、記録や候補に顔アイコンが表示されます。付き添いで一度入れただけの名前などは、ここから削除すると候補に出なくなります。'
  },
  {
    icon: 'i-lucide-user',
    title: 'ログインと引き継ぎ',
    body: 'アカウントタブからメールアドレスでログインすると、別の端末でも同じ記録を見られます。パスワードは不要で、届いたメールのリンクを押すだけです。ログイン前に記録したデータもアカウントに引き継がれます。'
  }
]
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center gap-2">
      <UButton
        to="/genba/account"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
      <h1 class="text-xl font-bold">
        使い方ガイド
      </h1>
    </div>

    <div class="flex flex-col gap-2">
      <UCard
        v-for="section in sections"
        :key="section.title"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/10">
            <UIcon
              :name="section.icon"
              class="text-primary"
            />
          </div>
          <div class="flex flex-col gap-1">
            <p class="font-semibold">
              {{ section.title }}
            </p>
            <p class="text-sm text-muted">
              {{ section.body }}
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
