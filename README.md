# Multicolor Sweeper Lab

3色・4色の爆弾を使った高密度マインスイーパーの、ゲームバランスとNo-Guess盤面生成の検証用アプリです。

**プレイURL：<https://hanagemaru.github.io/multicolor-sweeper-lab/>**

**B/C/D比較プレイ：<https://hanagemaru.github.io/multicolor-sweeper-lab/compare-colors.html>**

## 検証できる条件

- 盤面：9×9固定
- 爆弾色：3色 / 4色
- 爆弾数：15 / 20 / 25 / 30 / 35 / 40
- 初手と周囲8マスは安全
- 色別の隣接爆弾数をセル内に2×2で表示
- 0表示のオン / オフ
- Seedによる盤面再現
- 通常フラグ1種類
- プレイ結果を端末内に記録し、CSVで保存

同じSeed・同じ初手なら、3色と4色で爆弾の**位置**は共通です。爆弾数を増やした場合も、少ない条件の配置に爆弾が追加されるため、条件差を比べやすくしています。

## 遊び方

`index.html` をWebサーバーから開きます。

```bash
npm run serve
```

表示された `http://127.0.0.1:4173` をブラウザで開いてください。

- PC：左クリックで開く、右クリックで旗
- スマートフォン：画面上の操作モード切替、または長押しで旗

## 確認

```bash
npm test
npm run check
npm run benchmark -- 20 benchmark-results/node-latest.json
```

外部ライブラリを使わない静的Webアプリなので、依存関係のインストールは不要です。

ブラウザ実測は `benchmark.html` を開き、「測定開始」を押します。生成とSolverは
Web Worker内で動くため、UIメインスレッドを占有しません。

`compare-colors.html` では条件B/C/Dを切り替え、決定論的に生成される3盤面セットを
3色・4色で実プレイ比較できます。「次の3盤面」で同条件の盤面を追加できます。

## No-Guessエンジン

- `src/solver.js`: 見えているClueとセルdomainだけを使うルールベースSolver
- `src/no-guess-generator.js`: Seedとattempt indexによる決定論的な再生成・条件A〜Dの選別
- `src/benchmark-core.js`: 中央・中央付近・辺・角・ランダム初手の共通ベンチマーク
- `src/generator-worker.js`: ブラウザ用Web Worker
- `benchmark-results/`: 固定条件での測定結果

Solverは単一Clueの色別/総数制約、全盤面の総爆弾数、隣接Clueの
subset/difference、`safe / red / blue / green / yellow` のdomain伝播を使います。
確率、ランダム手、隠れた正解を推論には使いません。隠れた盤面は、テスト時に
推論が正解と矛盾しないことを検査するためだけに参照します。

条件の定義、推論トレース、color-essential、公平性フィルタの詳細は
[`SPEC.md`](./SPEC.md)、測定結果は
[`benchmark-results/README.md`](./benchmark-results/README.md)を参照してください。

## 既存Gradient Sweeperから引き継いだ考え方

- 9×9盤面
- 初手周囲の安全化
- 隣接爆弾0の連鎖開放
- 通常フラグ
- 安全マスをすべて開く勝利判定

検証版では、これらをSeed対応の3色・4色ルールへ拡張しています。既存の `gradient-sweeper` リポジトリには変更を加えていません。
