# 機械学習（XGBoost・MLP・その組み合わせ）で企業の行動を選ぶと、今の決まりより良くなるか（2026-11-23 本人の希望。先に一覧を決めてから回す）
# 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/ml_events_data.mjs > /tmp/ml_events.csv
#         python3 kabu-lens/research/swing/ml_events.py /tmp/ml_events.csv
# 未来を見ない：①前半だけで学習 → 後半・直近で確かめる ②前半＋後半で学習 → 直近で確かめる（時間順に分けるだけ。混ぜない）
# 学ぶのは寄指で買えた行だけ（y＝翌日の寄り→引けの全体比%）。比べるもの：
#   今の決まり：見送り（cur_rank 9）以外を全部買う／同じ日に2件以上買えたら、今の並べ方の1番目だけ
#   機械学習：予測が学習期間の予測の真ん中より上だけ買う／同じ日に2件以上なら予測の1番目だけ
# 結果（2026-11-23）：採らない。機械学習の予測と実際の成績の順位の相関は 後半 −0.04〜+0.02、直近 −0.19〜−0.02（当たっていない＝ほぼ0か逆）。
#   今の決まり（見送り以外）後半 +0.56%・直近 +0.66%。機械学習で選ぶと 後半 +0.26〜+0.46%・直近 +0.09〜+0.68%（どれも今の決まり以下）。
#   前半＋後半の900件で学んでも直近は今の決まり以下（XGBoost +0.50%、MLP +0.68%＝全部買うのと同じ）。
#   学べる件数（寄指で買えた発表）が数百件と少なく、1件ごとのぶれ（標準偏差 約3%）に比べて上乗せ（+0.4〜0.7%）が小さいため、
#   機械学習は偶然を覚えるだけになる。今の単純な決まり（良い条件の数・取得の割合・小さめの会社を先に）のほうが安定している
import sys
import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer

A, BB = '2021-11-19', '2025-11-14'
d = pd.read_csv(sys.argv[1])
d = d[d.filled == 1].copy()
d['per'] = np.where(d.date < A, 0, np.where(d.date < BB, 1, 2))
FEAT = ['kind_bb', 'kind_div', 'score', 'early', 'below25', 'bb_pct', 'bb_pct_known', 'bb_days', 'bb_market', 'bb_trust', 'div_up', 'div_known',
        'log_turn', 'log_price', 'r1', 'r5', 'r20', 'r60', 'dev25', 'atrp', 'volr', 'time_min', 'wday', 'tpx_r20', 'tpx_dev200', 'same_day_n']
X = d[FEAT].astype(float)


def models():
    xgb = XGBRegressor(n_estimators=200, max_depth=2, learning_rate=0.03, subsample=0.8, colsample_bytree=0.8, min_child_weight=10, reg_lambda=5, random_state=0)
    mlp = make_pipeline(SimpleImputer(strategy='median'), StandardScaler(), MLPRegressor(hidden_layer_sizes=(16, 8), alpha=1.0, max_iter=2000, early_stopping=True, random_state=0))
    return {'XGBoost': [xgb], 'MLP': [mlp], 'XGBoost＋MLP（平均）': [xgb, mlp]}


def fit_pred(ms, tr, te):
    ys = []
    for m in ms:
        Xt = X.loc[tr]
        m.fit(Xt if isinstance(m, XGBRegressor) else Xt, d.loc[tr, 'y'].clip(-8, 8))
        ys.append((m.predict(X.loc[te]), m.predict(Xt)))
    pte = np.mean([a for a, _ in ys], axis=0)
    ptr = np.mean([b for _, b in ys], axis=0)
    return pte, ptr


def evaluate(te, pred, thr):
    t = d.loc[te].copy()
    t['pred'] = pred
    out = {}
    out['全部買う'] = (t.y.mean(), len(t))
    cur = t[t.cur_rank < 9]
    out['今の決まり（見送り以外）'] = (cur.y.mean(), len(cur))
    sel = t[t.pred > thr]
    out['機械学習（予測が真ん中より上）'] = (sel.y.mean(), len(sel))
    both = t[(t.pred > thr) & (t.cur_rank < 9)]
    out['今の決まり かつ 機械学習'] = (both.y.mean(), len(both))
    multi = cur.groupby('date').filter(lambda g: len(g) >= 2)
    if len(multi):
        a = multi.sort_values(['date', 'cur_rank']).groupby('date').head(1)
        b = multi.sort_values(['date', 'pred'], ascending=[True, False]).groupby('date').head(1)
        out['同じ日に2件以上：今の並べ方の1番目'] = (a.y.mean(), len(a))
        out['同じ日に2件以上：予測の1番目'] = (b.y.mean(), len(b))
    ic = np.corrcoef(t.pred.rank(), t.y.rank())[0, 1]
    return out, ic


for name, tr_per, te_pers in [('① 前半で学習', [0], [1, 2]), ('② 前半＋後半で学習', [0, 1], [2])]:
    tr = d.index[d.per.isin(tr_per)]
    print(f'\n■ {name}（学習 {len(tr)}件）。翌日の寄り→引けの全体比%（件数）')
    for mn, ms in models().items():
        for tp in te_pers:
            te = d.index[d.per == tp]
            pte, ptr = fit_pred(ms, tr, te)
            res, ic = evaluate(te, pte, np.median(ptr))
            label = ['前半', '後半', '直近'][tp]
            print(f'  [{mn}] {label}  順位の相関 {ic:+.3f}')
            for k, (v, n) in res.items():
                print(f'      {k:24s} {v:+.2f}% ({n})')
# 参考：XGBoost（前半＋後半）が重く見た特徴
m = models()['XGBoost'][0]
tr = d.index[d.per.isin([0, 1])]
m.fit(X.loc[tr], d.loc[tr, 'y'].clip(-8, 8))
imp = sorted(zip(m.feature_importances_, FEAT), reverse=True)[:8]
print('\n参考：XGBoost が重く見た特徴（前半＋後半）: ' + '、'.join(f'{f} {v:.2f}' for v, f in imp))
