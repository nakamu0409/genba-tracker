# 立会外分売：楽天証券が公開している過去の実績（実際の割引率と、実施日の四本値）で確かめる（2026-11-23）
# 使い方: python3 kabu-lens/research/bunbai/study_rakuten.py fetch   （www.rakuten-sec.co.jp/web/domestic/off_auction/past_results/fy20XX.html → rakuten.csv）
#         python3 kabu-lens/research/bunbai/study_rakuten.py
# 分売価格で買い、実施日の寄り（または引け）で売ったときの%。期間：前半（〜2021-11-18）／後半（〜2025-11-13）／直近
# 結果（2026-11-23、2016-04〜2025-12 の802件。割引の真ん中 2.98%）：
#   寄りで売る：+1.54%（得77%・損17%）／+1.78%（75%・16%）／+1.74%（91%・0%、11件）。引けで売る：+1.89／+2.05／+1.89%
#   割引2.5%未満でも +1.48／+1.87%。悪いほう10%目 −0.7%、一番悪い −8.5%。
#   → 手元の日足からの推定（study_bunbai.mjs）より良い。3つの期間とも安定してプラス。注意：人気の分売は抽選で、1人の上限株数（100株が多い）がある。
# 口座全体の10年（11/25、study_combined の bunbai。訂正を除いたデータ。前の晩に申し込んで現金を押さえ、寄り前に分売価格で買う）：前半／後半／直近
#   今 21.3／38.9／56.7%（一番下げ −25.5%）、100株・寄りで売る 42.0／52.4／55.4%（−22.3%・703回・勝ち76%）、100株・引けで売る 47.1／54.0／55.7%（−21.3%）、
#   100株・当選が半分 32.9／45.8／54.1%、200株 50.2／59.8／57.1%（−20.5%）。年ごとの差は 2017〜2021 が大きくプラス（資金が小さいほど100株の分売が効く）、2023・2025・2026 はマイナス。
#   楽天の実績は2025-12までなので2026年（と直近の期間）は分売が無く、2026 の −11.4 は買った株の違いによるぶれ（年ごとの差には±10ポイントほどのぶれがあると分かる）。
#   物差し（stat_check）は「偶然でも出る範囲」（プラスの年 6〜7/10）。ただし前半・後半の伸びは今までの案で一番大きい。12/15 に本人に出す。本番に入れる前に、これからの分売を毎晩記録して本番の割引・成績を確かめたい
# 資金を変えても（11/25）：100万円 今 21.9／41.4／71.7% → 分売100株 37.1／49.8／74.7%（当選半分 30.5／43.8／78.4%）、200万円 22.6／38.3／103.9% → 30.0／41.6／104.0%（当選半分 26.5／39.5／103.3%）。
#   資金が大きくなるほど伸びは小さくなる（100株の上限があるため）が、どの資金でも前半・後半は上、直近は同じか上。年ごとはプラス6〜7/10年
import csv, glob, os, re, statistics as st, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, 'rakuten.csv')
if len(sys.argv) > 1 and sys.argv[1] == 'fetch':
    rows = set()
    for y in range(2016, 2031):
        h = subprocess.run(['curl', '-s', '-A', 'Mozilla/5.0', f'https://www.rakuten-sec.co.jp/web/domestic/off_auction/past_results/fy{y}.html'], capture_output=True).stdout.decode('utf-8', 'ignore')
        for tr in re.findall(r'<tr.*?</tr>', h, re.S):
            t = re.sub(r'\s+', ' ', re.sub('<[^>]+>', '|', tr))
            m = re.search(r'([0-9][0-9A-Z]{3})\s+\S+\|.*?(\d{4})/(\d{1,2})/(\d{1,2}).*?([\d,.]+)円.*?([\d,.]+)円.*?（([\d.]+)%）(.*)', t)
            if not m:
                continue
            px = [p.replace(',', '') for p in re.findall(r'([\d,.]+)円', m.group(8))[:4]]
            px += [''] * (4 - len(px))
            rows.add((m.group(1), f'{m.group(2)}-{int(m.group(3)):02d}-{int(m.group(4)):02d}', m.group(5).replace(',', ''), m.group(6).replace(',', ''), m.group(7), *px))
    with open(CSV, 'w') as f:
        f.write('code,date,prev,price,disc,o,h,l,c\n')
        for r in sorted(rows, key=lambda r: r[1]):
            f.write(','.join(r) + '\n')
    sys.exit()
R = [r for r in csv.DictReader(open(CSV)) if r['o']]
per = lambda d: 0 if d < '2021-11-19' else 1 if d < '2025-11-14' else 2
print('件数', len(R), '割引の真ん中', st.median(float(r['disc']) for r in R))
for name, f in [('全部', lambda r: True), ('割引2.5%未満', lambda r: float(r['disc']) < 2.5), ('2.5〜2.95%', lambda r: 2.5 <= float(r['disc']) < 2.95), ('2.95%以上', lambda r: float(r['disc']) >= 2.95)]:
    out = []
    for p in range(3):
        z = [r for r in R if per(r['date']) == p and f(r)]
        if not z:
            out.append('—')
            continue
        o = [float(r['o']) / float(r['price']) * 100 - 100 for r in z]
        c = [float(r['c']) / float(r['price']) * 100 - 100 for r in z]
        out.append(f"寄り {st.mean(o):+.2f}%（得{sum(v > 0 for v in o) / len(o) * 100:.0f}%・損{sum(v < 0 for v in o) / len(o) * 100:.0f}%）引け {st.mean(c):+.2f}% n{len(z)}")
    print(name, ' ／ '.join(out))
o = sorted(float(r['o']) / float(r['price']) * 100 - 100 for r in R)
print('寄りの悪いほう10%目', round(o[len(o) // 10], 2), '一番悪い', round(o[0], 2))
