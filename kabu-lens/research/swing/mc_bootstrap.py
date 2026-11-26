# 運の幅の試算（2026-11-21）：study_combined.mjs の MONTHLY モードで出した月ごとの増減（でたらめな順番20回 × 約119か月）から、
# 3か月ずつのかたまりを無作為に選んでつなぎ、1年・3年の道のりを1万回つくる。増減の分布・マイナスの確率・一番下げの分布を出す
# 使い方: MONTHLY=<cfg.json> node --max-old-space-size=7000 kabu-lens/research/swing/study_combined.mjs > months.json
#         python3 kabu-lens/research/swing/mc_bootstrap.py months.json
# 注意：月の終わりの資産で数えるので、月の途中の下げは入らない（一番下げは実際より浅く出る）。検証の成績そのものが手数料0・今ある銘柄中心なので、分布全体が実際より上に出ている
# 結果（11/21・今の本番の決まり：損0.5%・1銘柄62%・自社株買いの新しい条件・売買代金の1.5%まで）：
#   1年：増減 悪い5% −8.3%／悪い10% −1.4%／真ん中 +29.0%／良い10% +70.3%／良い5% +84.7%。マイナスの年 11%。一番下げ 真ん中 −7.7%・悪い10% −18.9%。−25% に届く 2.5%
#   3年：真ん中 +115%、悪い10% +38%、良い10% +246%。マイナス 1.6%。−25% に届く 10.5%（3年に1割は歯止めに当たる）
import json, random, sys
d = json.load(open(sys.argv[1]))
series = [[r for _, r in s] for s in d]
random.seed(1)
def path(n):
    out = []
    while len(out) < n:
        s = random.choice(series)
        i = random.randrange(0, len(s) - 3)
        out += s[i:i + 3]
    return out[:n]
for n, lab in [(12, '1年'), (36, '3年')]:
    fin, dd = [], []
    for _ in range(10000):
        e = pk = 1.0
        m = 0.0
        for r in path(n):
            e *= 1 + r / 100
            pk = max(pk, e)
            m = min(m, e / pk - 1)
        fin.append((e - 1) * 100)
        dd.append(m * 100)
    fin.sort(); dd.sort()
    q = lambda a, p: round(a[int(p * (len(a) - 1))], 1)
    print(lab, '増減', {p: q(fin, p) for p in (.05, .1, .25, .5, .75, .9, .95)}, 'マイナス', round(sum(x < 0 for x in fin) / len(fin) * 100, 1), '%')
    print('   一番下げ', {p: q(dd, p) for p in (.05, .1, .5)}, '−25%に届く', round(sum(x <= -25 for x in dd) / len(dd) * 100, 1), '%')
