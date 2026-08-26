# Project Status

## 現在地

- 9×9・20爆弾向けNo-Guess Solver/生成器を実装済み
- 3色/4色共通爆弾位置、Seed+attemptの決定論的再生成を実装済み
- color-essentialと公平性フィルタA〜Dを実装済み
- 推論トレース、自動テスト、Node/ブラウザ共通benchmark、Web Workerを実装済み
- Node benchmark（各条件×各初手20回）を保存済み

## 確定事項

- 標準Solverはルールベース。確率・ランダム手・隠れた正解参照による推論は禁止
- C: 4色round数 <= 3色round数
- D: 4色round数が3色より1以上少ない
- C/Dは比較用の暫定評価で、製品採用条件としては未確定

## 未解決事項

- 条件C/Dのどちらを製品採用するか（測定結果と実プレイで判断）
- 製品版で許容する端末別生成待ち時間
- Exact Solverは現時点では未実装（標準No-Guess判定には不要）

## 次の作業

1. 実ブラウザのWorker benchmark結果を保存する
2. 実装ブランチのPRを作成しレビューする
3. Solver確定後、製品版RepoへWorker境界ごと移植する
