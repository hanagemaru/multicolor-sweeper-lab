# No-Guess盤面生成仕様

## 対象

- 9×9、15/20/25爆弾を製品版の難易度候補とする（20爆弾が標準）
- 初手セルと周囲8セルは安全
- 3色と4色は同一Seed・同一初手・同一attemptで爆弾位置を共有する
- 同じ入力から同じ候補列と同じ採用盤面を生成する

## 標準Solver

標準Solverは、プレイヤーに見えているClueと、それまでの論理的な確定結果だけを使う。
確率、ランダム選択、隠れた正解を推論規則には使わない。

各未開封セルは `safe / red / blue / green / yellow` のdomainを持つ。3色モードでは
yellowを含めない。次の制約をdomainが収束するまで反復する。

1. 各Clueの色別爆弾数
2. 各Clueの全色合計爆弾数
3. 盤面全体の総爆弾数
4. 隣接するClue制約間のsubset/difference
5. 確定状態による各制約の残数更新

制約の残数が0なら対象状態を除外し、残数が候補セル数と等しければ対象状態を確定する。
確定したsafeを開き、新しいClueを得て次のreasoning roundへ進む。安全セルをすべて
開けばNo-Guess合格、未開封安全セルが残るのに確定safeがなくなれば不合格とする。

隠れた盤面は、Solverが確定したdomainに真の状態が残っているかを検査する
soundness assertionと、安全と確定したセルを実際に開くシミュレーションにだけ使う。

## 推論トレース

`solveBoard(board, { includeTrace: true })` は次を返す。

- 初手と初手連鎖で開いたセル・Clue
- reasoning roundごとの開始時/終了時の開封数
- 各domain変更の前後、規則、対象predicate
- 根拠Clue、対象セル集合、残り爆弾数
- そのroundで新たに開いたセル・Clue
- 規則別使用回数と集計値

これにより、初手から終了または停止までを順番に再検証できる。

## color-essential

同じ爆弾位置を次の2種類のSolverで解く。

- 多色: 色別Clueと全色合計を利用
- 単色化: 全色を合算した通常の数字のみ利用

3色・4色の両方がNo-Guessで解け、多色と同等の規則を使う単色化Solverが途中で
詰まる候補をcolor-essentialとする。

## 採用フィルタ

| 条件 | 定義 |
|---|---|
| A | 3色・4色ともNo-Guess |
| B | Aかつcolor-essential |
| C | Bかつ4色のreasoning round数が3色以下 |
| D | Bかつ4色のreasoning round数が3色より1以上少ない |

製品版の採用条件はCとする。Dは比較用としてLabに残す。

## Seed再現性

候補Seedは `${baseSeed}|attempt:${attempt}`。不採用ならattemptを1ずつ増やす。
同一baseSeed、初手、爆弾数、フィルタ、最大試行回数からは、毎回同じ採用盤面へ到達する。

## 実行境界

ブラウザでは生成とベンチマークをmodule Web Workerで実行する。製品UIはWorkerへ
リクエストを送り、応答を待つ構成とし、生成中もメインスレッドをブロックしない。
