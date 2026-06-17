# nanoverse

研究室の定常作業をブラウザだけで完結させるツール集。バックエンド不要・データはブラウザ内（IndexedDB）に保存。

## ツール

### マスク設計（マスクレス露光）
- µm 寸法を直接指定して図形を配置 → **DMD 解像度の 1bit BMP を書き出し**
- 換算「20倍 1cm = 14µm」を内部で保持（スライド全体 = DMD 全面）
- 図形：矩形・楕円・線・文字・ストライプ（等間隔の平行線）・グリッド（格子）
- PowerPoint + 別変換ツールを置き換え、設計データは保存して再編集可能

### スペクトル解析（Igor の簡易代替）
- 測定 txt をドロップ → 即グラフ。出版用スタイルは既定適用（mirror 枠・内向き tick・Times New Roman）
- PL（nm⇄eV）/ Raman（ラマンシフト cm⁻¹）/ XRD（2θ）
- トレース毎の色・線幅、凡例位置、ベースライン補正、正規化
- ピークフィット（Gaussian / Lorentzian）→ 中心・FWHM・面積、PNG/SVG/CSV 出力

## 技術スタック
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui (Base UI) · IndexedDB

## 開発
```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build && pnpm start
```
各自がローカルでサーバーを立て、ブラウザから利用します。

## ライセンス
MIT
