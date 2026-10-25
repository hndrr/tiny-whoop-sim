# 画面のリッチ化 第3弾 ＋ FPV 横揺れの修正

## Context
- 第2弾（`f92e201`）で映像パスとカメラの揺れを入れた結果、FPV が「無駄に横揺れ」するようになった。原因はコードで特定済み：
  1. `dist/camera-motion.mjs`：FPV でもカメラ単体に乱流回転（`turbulence.fpv=.010` rad、`rotateY` で 0.3〜0.9 Hz のヨー揺れ）をかけている。FPV カメラは機体に固定なので、画面下のダクト／プロペラと景色がずれて揺れ、不自然。
  2. `dist/feed-post.mjs`：`jello.y=shake*.35` が `uv.x += jello.y*sin(uvv.y*9.+t*347.)` で、毎フレーム位相が飛ぶ横方向のゆらぎ（最大 ~0.35% 幅＝数 px）になっている。これが横ジッタの主因。
  3. ローリングシャッターの skew（`jello.x`）とモーションブラーの `blurShift` が、フレーム差分の生の `yawRate` を使っており、dt のばらつきでちらつく。
- ユーザーの要望：FPV は「ごく微細な振動だけ残す」。リッチ化は「地表・景観のディテール」「HUD/OSD のデザイン」「空・光・天候の演出」。
- 方針は第2弾と同じ：追加コストは品質レベル（`dist/render-quality.mjs` の `QUALITY_LEVELS`）に連動させ、スマホ（coarse pointer は `balanced` 開始）でも破綻させない。「動きを減らす」設定では新しい動きも止める。

## Phase 0：計画を docs に保存
- この計画を `docs/graphics-upgrade-3-plan.md` として保存してから着手（第1・2弾と同じ流儀）。

## Phase 1：FPV 横揺れの修正（最優先・単独コミット）
`dist/camera-motion.mjs`
- FPV は乱流回転をやめる（`turbulence.fpv` を 0、FPV では `rotateY` をかけない）。
- FPV に残すのはピッチ軸（`rotateX`）の高周波微振動のみ。振幅は `vibration.fpv ≈ .0008` rad（720p・FOV105° で 1px≈.0026 rad なので ~0.3px＝「ごく微細」）。
- `yawRate`/`pitchRate` に指数ローパス（時定数 ~0.08 s）＋小さなデッドゾーンをかけてから `output` に出す。
- CHASE の挙動（FOV 伸縮・バンク追従・揺れ）は変えない。

`dist/feed-post.mjs`
- `jello.y`（毎フレーム位相が飛ぶ横ゆらぎ）は FPV では 0。CHASE は既存の 0.6 倍のまま。
- `jello.x`（旋回時の skew）は平滑化済み `yawRate` を使うので残す。

テスト（`test-video-pass.mjs` に追加）
- FPV で 240 フレーム回しても、カメラの前方ベクトルの水平成分（ヨー）が変化しない、ピッチ偏差は `vibration.fpv*(.35+throttle)` 以下。
- FPV では `u.jello.value.y===0`。
- ノイズの乗った heading 列を与えても `yawRate` 出力の変動が抑えられる。

## Phase 2：HUD / OSD のリッチ化
新規 `dist/osd.mjs`（DOM＋インライン SVG、Canvas 追加なし）。`main.mjs` の `updateHUD()` から呼ぶ。
- **人工水平線**（FPV のみ）：レティクル周りに Betaflight 風の水平バー＋ピッチラダー（±10°/20°）。`s.pitch`/`s.roll` を CSS `transform` で回すだけ。
- **コンパス帯**（上部中央、明るさスライダーの下）：5° 目盛・N/E/S/W・HOME マーカー（`homeNavigation()` の bearing を流用）。
- **HOME 矢印**：現在の機首に対する相対方位で回る矢印＋距離（既存 `#homeNav` を拡張）。
- **計器の装飾**：SPD/ALT に縦の V/S インジケータ、THR をセグメント化したバー、飛行時間タイマー（`s.elapsed`、既存 CSS に `#timer` 枠あり）。
- 見た目：既存のミント（`#94f5cf`）をアクセントに、薄いグラス背景・細いアウトライン・FPV 時の淡い発光。CHASE ではラダーを隠し、落ち着いた表示。
- 既存 ID（`speed`, `alt`, `throttle`, `bar`, `heading`, `vertical`, `homeNav`, `gate` 等）とメディアクエリ（coarse / max-height:520 / pointer:fine 各種）・i18n 契約は維持。DOM 書き込みは値が変わったときだけ（スマホ負荷対策）。
- 「動きを減らす」でもラダーは状態表示なので動かす（アニメ演出は入れない）。
- テスト：新規 `test-osd.mjs`（コンパス目盛の巡回、HOME 相対方位、ラダー変換、値不変時に DOM を書かない）。`package.json` の `test`/`check` に追加。既存 `test-controls`/`test-ring-practice`/`test-stage-completion` の HTML/CSS 契約を壊さないこと。

## Phase 3：地表・景観のディテール
- **地形シェーダの近景ディテール**（`dist/terrain-visuals.mjs` の `applyTerrainShading`）：`terrainNear` 圏内で 1〜4 m スケールの草むら／土のパッチ、花の点、`dFdx/dFdy` による擬似バンプで低空時の起伏感を出す。`TERRAIN_SHADING` に定数追加、`customProgramCacheKey` を v2 に。
- **カメラ追従の近景グラス**（新規 `dist/grass-field.mjs`）：カメラ周囲 ~60 m を 16 m セルに分け、セルが入ったときだけ CPU で配置（ハッシュで決定的、`terrainHeight` で高さ、急斜面・海・滑走路/建物は除外。除外判定は `main.mjs` 既存の 11000 本の草配置の条件を関数化して流用）。既存 `bladeGeo`/`grassMat`/`applyWind` を再利用し、1 InstancedMesh・1 draw。本数は品質連動（`QUALITY_LEVELS` に `grass` を追加：high 16k → low 4k）。
- **舗装のタイリング崩し**：`dist/surface-patterns.mjs` の asphalt にひび・補修跡・タイヤ痕を追加し、`surface-materials.mjs` 側でワールド座標の大スケールノイズを乗算して 4 m タイルの繰り返しを隠す。

## Phase 4：空・光・天候
- **雲の影**：空の雲と同じノイズ（`main.mjs` の sky シェーダの `skyNoise`、`clock*.004` のドリフト）を太陽方向へ投影し、地形（`applyTerrainShading`）と海（`dist/ocean-surface.mjs`）で拡散光を落とす。共有 GLSL は `dist/atmosphere.mjs` に `CLOUD_GLSL` として切り出し、空・地形・海で同一式＝空の雲と影が一致。clock は既存の `oceanMat.uniforms.clock` を共有。
- **雲のリッチ化**：雲の底を暗く、太陽側の縁を明るく（シルバーライニング）、高層の薄い巻雲を 1 層追加。
- **光芒（ゴッドレイ）**：`dist/feed-post.mjs` で太陽が画面内／近傍のとき、深度で空マスクを取り、太陽方向へ放射状に mip 3 から 8〜12 タップ。品質連動（`QUALITY_LEVELS` に `shafts` を追加、low で 0）。深度なし端末は輝度マスクで代用（既存のフレア遮蔽と同じ分岐）。
- **空気感**：`ATMOSPHERE` の太陽側散乱を少し強め、遠景の青み（空気遠近）を追加。

## Phase 5：品質連動・テスト・ドキュメント
- `QUALITY_LEVELS` に `grass`/`shafts` を追加し、`test-video-pass.mjs` の「品質が下がると上がらない」チェックの対象に含める。
- 意図して変わる既存テストの固定値（`test-fpv-signal` のシェーダ断片、`test-terrain-visuals`、`test-ocean-surface`、`test-atmosphere`、`test-painted-materials`/`test-surfaces` の asphalt 等）は新しい契約に更新。
- `docs/render-performance.md` に第3弾の節（前後の draw call・P95）、README に OSD と FPV 揺れの記述を追記。

## 主な変更ファイル
- 新規：`dist/osd.mjs`、`dist/grass-field.mjs`、`test-osd.mjs`、`test-grass-field.mjs`、`docs/graphics-upgrade-3-plan.md`
- 変更：`dist/camera-motion.mjs`、`dist/feed-post.mjs`、`dist/main.mjs`、`dist/index.html`、`dist/style.css`、`dist/terrain-visuals.mjs`、`dist/atmosphere.mjs`、`dist/ocean-surface.mjs`、`dist/surface-patterns.mjs`、`dist/surface-materials.mjs`、`dist/render-quality.mjs`、`package.json`、関連テスト、README、docs

## 検証
- 各 Phase 後に `npm test && npm run check`。
- Playwright（プリインストールの Chromium、`node serve.mjs`）で FPV/CHASE の固定ポーズのスクリーンショットを `f92e201` と比較（地表低空・太陽方向・海上・スマホ幅 390×844・`?quality=low`）。
- FPV 揺れ：ホバー中と直進中に毎フレーム `camera.quaternion` を記録し、ヨー偏差 0・ピッチ偏差が微小なことを数値で確認（`?profile=1` の `tinyWhoopProfile` 経由）。
- `?profile=1` の snapshot で draw call と P95 を比較（グラスで +1、光芒はポスト内のみで +0 の想定）。
- iPhone 実機の FPS と見た目はこの環境では確認不可。
- Phase 1 を先に単独コミットし、その後の Phase ごとにコミット。`feat/mobile-surface-detail` に push し、ドラフト PR を作成。

## 実装メモ（計画からの差分）
- 飛行時間タイマーは入れなかった。リング練習は「タイマーなし」が既存の契約（`test-ring-practice` で `#timer` を禁止）のため。
- `ATMOSPHERE` の霧の色と密度は既存の契約（`test-terrain-visuals`/`test-atmosphere`）なので変えていない。空気感は、雲の影と光芒で出している。
- 舗装のタイリング崩しはテクスチャを変えず、ワールド座標のシェーダだけで行った。既存の平均明度の契約は保っている。
- グラスは計画の 16k 本ではなく、4 枚刃の房（tuft）9k（タッチ端末は 6k）にした。房のほうが少ない本数で密に見えるため。インスタンスの並びを band-major にし、品質を下げたときは描画数そのものを減らす。
