# ローソク足の予測の AI（Kronos-small）が、日本株の次の5日を当てるか（2026-11-21。先に一覧を決めてから回す）
# 使い方: python study_kronos.py <Kronos のリポジトリのフォルダ> <出力の JSON>   （途中から再開できる）
# 期間：Kronos が学習で見ていない 2025-09-01 以降だけ（公開は2025年夏ごろ。それより前の株価は学習に入っている恐れがある）
# 対象：2025-08 末の時点で売買代金（20日平均）の大きい150銘柄（research/wide.json）
# 予測：各日 d に、d までの400本の日足から次の5本を予測。予測の騰落＝5本目の予測の終値 ÷ d の終値 − 1
# 実際：d の翌日の寄りで買い、5日目の引けで売る。TOPIX 連動ETF（swing/bench1306.json・桁の誤りの日は除く）との差
# 日付：TOPIX の営業日で5日ごと（重ならないように）
import sys, json, os
sys.path.insert(0, sys.argv[1])
import pandas as pd, torch
torch.set_num_threads(3)
from model import Kronos, KronosTokenizer, KronosPredictor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[2]
wide = json.load(open(os.path.join(HERE, '..', 'wide.json')))
braw = json.load(open(os.path.join(HERE, 'bench1306.json')))
bench = []
for b in braw:
    if bench and (b['c'] / bench[-1]['c'] > 1.3 or b['c'] / bench[-1]['c'] < 0.7):
        continue
    bench.append(b)
bdates = [b['date'] for b in bench]
bidx = {d: i for i, d in enumerate(bdates)}

def frame(code):
    rows = [r for r in (wide[code].get('d') or []) if r[1] and r[4] and r[1] > 0 and r[4] > 0]
    df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
    df['amount'] = df['close'] * df['volume']
    return df

# 対象：2025-08-29 時点の20日平均の売買代金の上位150
cand = []
for code, w in wide.items():
    try:
        df = frame(code)
    except Exception:
        continue
    s = df[df['date'] <= '2025-08-29'].tail(20)
    if len(s) < 20 or len(df[df['date'] <= '2025-08-29']) < 400:
        continue
    cand.append((float((s['close'] * s['volume']).mean()), code))
codes = [c for _, c in sorted(cand, reverse=True)[:150]]
frames = {c: frame(c) for c in codes}

dates = [d for d in bdates if d >= '2025-09-01'][::5]
done = json.load(open(OUT)) if os.path.exists(OUT) else {}
tok = KronosTokenizer.from_pretrained('NeoQuasar/Kronos-Tokenizer-base')
mdl = Kronos.from_pretrained('NeoQuasar/Kronos-small')
pred = KronosPredictor(mdl, tok, device='cpu', max_context=512)
for d in dates:
    if d in done:
        continue
    k = bidx[d]
    if k + 5 >= len(bench):
        break
    rows = {}
    xs, xts, yts, keep = [], [], [], []
    for c in codes:
        df = frames[c]
        idx = df.index[df['date'] == d]
        if not len(idx):
            continue
        i = int(idx[0])
        if i < 400 or i + 5 >= len(df):
            continue
        x = df.iloc[i - 399:i + 1].reset_index(drop=True)
        xs.append(x[['open', 'high', 'low', 'close', 'volume', 'amount']])
        xts.append(pd.to_datetime(x['date']))
        yts.append(pd.Series(pd.to_datetime(df['date'].iloc[i + 1:i + 6].values)))
        keep.append((c, i))
    if not xs:
        done[d] = {}
        continue
    preds = pred.predict_batch(xs, xts, yts, pred_len=5, T=1.0, top_p=0.9, sample_count=1, verbose=False)
    for (c, i), p in zip(keep, preds):
        df = frames[c]
        c0 = float(df['close'].iloc[i])
        o1 = float(df['open'].iloc[i + 1])
        c5 = float(df['close'].iloc[i + 5])
        d1, d5 = df['date'].iloc[i + 1], df['date'].iloc[i + 5]
        if d1 not in bidx or d5 not in bidx:
            continue
        bm = (bench[bidx[d5]]['c'] / bench[bidx[d1]]['o'] - 1) * 100
        rows[c] = {'pred': (float(p['close'].iloc[-1]) / c0 - 1) * 100, 'act': (c5 / o1 - 1) * 100 - bm}
    done[d] = rows
    json.dump(done, open(OUT, 'w'))
    print(d, len(rows), flush=True)
print('finished', len(done))
