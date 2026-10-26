# グラフィックのリッチ化と低負荷化（Open Water と PG2026 Narita 論文を参考に）

> 状況：Phase 0〜8 は実装済み。計測値と検証結果は [render-performance.md](render-performance.md) にある。実機（iPhone）での FPS は未計測。

## Context

参考資料は2つ。この計画では、それぞれから実装に使える考え方だけを取り出す。

- **Open Water.html**：フルスクリーン1パスで描く WebGL2 水面。分散波（exp-sine）を足し合わせ、画素の大きさ（footprint）に応じて高周波の波を消すことで、遠景ほど安く、エイリアスも出ない。ほかに Schlick フレネル、空関数の再利用による映り込み、サングリント、霞、カメラ追従でテクセル単位にスクロールする波紋シミュレーション、DPR 上限、`antialias:false` を備える。
- **論文（Extended Quadtree Tall Cells）**：解像度は見える層（optical layer）にだけ割り当て、深い部分は粗いセルにまとめる。適応の軸は2つある。水平方向は四分木で局所の複雑さに合わせ、厚み方向は全体の動きに合わせる。どちらも、解像度にも縮尺にも依存しない正規化コスト `I` を求め、`clamp(αI, dmin, dmax)` で値を決め、急な変化は平滑化する。粗いセルへの伝播は多数決で行う。

調査で見つかった現状の無駄（`dist/main.mjs`）：
- 地形256チャンクのうち187は不透明な海面より下にあり、見えないのに near/far の両方を生成・描画している。
- `logarithmicDepthBuffer:true` で全シェーダが `gl_FragDepth` を書くため、early-Z（iOS では HSR）が効かない。そのうえ空ドームが最初に描かれるので、全画面で空をシェーディングしてから上書きしている。
- `antialias:true` だが、シーンは MSAA なしの RT に描かれるため、キャンバスの MSAA はメモリと帯域を消費するだけで効果がない。
- 影マップを毎フレーム再描画している。海面平面や地面の線（高さ1cm）まで影を落とす対象になっている。
- 飛行場付近だけで描画コールが約500ある。内訳はゲート18基で234、岩95個は1個ずつ、ほかに同じ素材の箱が多数。
- 海はシェーダの波2本だけで、800m 間隔の頂点を波長63m で変位させており、完全にエイリアスしている。霧もかかっていない。

ユーザーの選択：全範囲（基盤、大気と空、海面、適応品質、吹き下ろし波紋、画面誤差 LOD、人工物、地形の質感、岩・草・樹木、機体モデル）。

## 方針（参考資料との対応）

| 参考資料の考え方 | 本アプリでの実装 |
|---|---|
| optical layer 以外は粗くてよい | 海面下の地形を生成しない。空と海は遮蔽物の後に描き、early-Z で隠れた画素を捨てる |
| 四分木による水平適応（局所の複雑さ） | 地形 LOD を「画面上の誤差(px)」で選ぶ。起伏の大きい尾根は遠くまで詳細を残す |
| 動きに応じた厚み適応 | 品質制御：正規化コスト `I = frameMs / refreshMs` → clamp → ヒステリシス。影も動的な投影物がある時だけ更新する |
| 正規化して縮尺に依存させない | LOD の誤差は px、品質のコストは無次元、波の帯域は footprint を基準にする |
| 平滑化・多数決による伝播 | 段階切替に滞留時間とヒステリシスを設ける。静的メッシュはセル単位で結合する |
| Open Water の footprint による帯域制限 | 海の波の本数を画素の大きさで打ち切る（early break）。草や地形のディテールは遠方でフェードさせる |

共通ルール：
- ビルドなし（`dist/` が正）。依存は vendored の three r180 だけ。
- 衝突・物理・ミッション・UI 文言は変えない。描画だけを変える。
- このリポジトリのテストはソース文字列やハッシュを固定している。意図して変える契約は、各フェーズで該当テストの期待値を新しい契約に書き換え、理由をコメントに残す。FPV のポストシェーダは全フェーズで一切触らない（`test-chase-signal` のハッシュを維持する）。

## Phase 0：計測基盤
- `dist/render-profile.mjs` / `main.mjs`：`?profile=1` 時の `tinyWhoopProfile` に `capture()` を追加する。現在の calls・triangles・programs・textures、品質レベル、深度モードを返す。
- 固定ポーズは6箇所：飛行場低空、格納庫内、港の水面低空、沖合、島上空300m、尾根の森。それぞれ FPV と CHASE で撮る。`window.skyward.state` で位置を設定する。
- 内蔵ブラウザ（`.claude/launch.json` に `npm start` / port 4173 を追加）で、変更前の数値とスクリーンショットを取得する。結果は `docs/render-performance.md` に、フェーズごとの before/after として記録する。

## Phase 1：低負荷化の基盤（見た目はほぼ不変）
1. **深度**：新規 `dist/render-depth.mjs`。小さなプローブ用 canvas で `EXT_clip_control` の有無を調べる（iOS では約99%の対応率）。
   - ある場合：`reversedDepthBuffer:true` にし、飛行用 RT（`render-color.mjs` の `createFlightRenderTarget`）と preview capture（`flight-selector.mjs` の `createPreviewCapture`）に `DepthTexture(FloatType)` を付けて DEPTH_COMPONENT32F にする。
   - ない場合：現行の `logarithmicDepthBuffer:true` を使う。
   - `?depth=log` で強制的に log 深度にでき、A/B 比較に使う。カスタムシェーダの logdepth chunk は残す（reversed では no-op になる）。
   - `test-render-surfaces.mjs` の深度量子化モデルに reversed float32 を追加し、`antialias`/`logarithmic` の文字列アサートを新しい契約に変える。
2. `antialias:false`（キャンバス MSAA は元からシーンに効いていない）。
3. 描画順：`skyDome.renderOrder` を最後、海を地形と建物の後にする。early-Z で隠れた空と海の画素を捨てる。
4. 海面下の地形：24分割メッシュの最高点が `SEA_LEVEL-.5` 未満のチャンクは生成しない。`terrainChunks` の形は変えないので、preview と既存テストはそのまま動く。
5. 影：
   - 海面平面、地面の線、地面スラブの `castShadow=false`。
   - 新規 `dist/shadow-scheduler.mjs`：`shadowMap.autoUpdate=false`。影カメラはテクセルにスナップして再センタリングする（揺らぎも消える）。機体が内側半径16m を出た時、CHASE で低空（クリアランス40m未満）の時、リセット・エリア変更・preview の後だけ `needsUpdate` にする。
   - `selection-integration.mjs` の `withStagePreview` は、描画前と復元後に invalidate する。
6. 格納庫の PointLight×2：`airfieldGroup` と連動して1100m を超えたら消す。両方の状態を起動時に `compileAsync` で事前コンパイルし、切替時のカクつきを防ぐ。
7. roughness=1 の拡散面（地形、樹冠、樹皮、草、岩）を `MeshLambertMaterial` にする。3ポーズで平均輝度の差が ±3% 以内であることをスクリーンショットで確認し、超える場合は戻す。`test-terrain-visuals` などの文字列アサートを更新する。

## Phase 2：人工物（描画コール削減とディテール）
1. 新規 `dist/static-batch.mjs`：構築後の後処理として、`airfieldGroup`（120m セル単位）と各 `regionGroup` の静的メッシュを（素材、セル、castShadow）ごとに1ジオメトリへ結合する。ワールド行列を焼き込み、metre UV は保持する。
   - 除外：ゲートのリング（フラッシュで素材を差し替える）、風車ローター、ライト、機体、ミッションマーカー、`userData.dynamic`。
   - `box()` ヘルパーは残すので、`test-render-surfaces` の `between()` 抽出はそのまま通る。
2. ゲート：支柱・脚・帯を `InstancedMesh` にする（3描画）。リングはゲートごとに残す。234 → 約21描画。
3. ディテール：`surface-patterns.mjs` に波板（コンテナ、格納庫の壁と屋根のリブ）とパネル目地の手続きテクスチャを追加する（各256²、既存の生成器を流用）。`userData.tileMeters` の metre UV で貼る。
4. 接地感：結合時に「物体底面からの高さ」を頂点属性に焼き込む。値は線形なので補間しても正確になる。`onBeforeCompile` で底部0.8m を暗くし（接地 AO）、上端をわずかに明るくする。

## Phase 3：地形 LOD と質感
1. 新規 `dist/terrain-lod.mjs`：
   - チャンクごとに誤差 ε（near と far 補間の最大差）を構築時に求める。
   - `ε·(viewportH / 2tan(fov/2)) / d > τ`（約1.5px、±20% のヒステリシス）なら near にする。機体がいるチャンクと隣接チャンクは常に near。
   - 既存の境界補間（`createTerrainGeometry`）により、どう混ざってもクラックは出ない。
   - `main.mjs` の毎フレーム処理と `withStagePreview` で共有する。ε がないモック（既存テスト）は従来の950m にフォールバックする。
2. 地形シェーダ（Lambert の `onBeforeCompile`）：
   - フラット法線の傾斜で岩肌を混ぜる。海岸に砂帯を入れる。ワールド空間のマクロ変化を加える。
   - 詳細マップは距離でフェードさせる（モアレ防止）。
   - 既存の頂点カラーのパレットは維持し、`test-terrain-visuals` と `test-ground-output` の数値下限も守る。
3. `surface-patterns.mjs`：草の詳細マップを、白色ノイズから多重スケールの草むらパターンに置き換える。

## Phase 4：岩・草・樹木
1. 岩：シード付き変位のファセット形状を4種用意し、種類ごとに `InstancedMesh` にする（95 → 4描画）。上面に苔色、底部を暗くする。`rand()` の消費順は完全に維持し、種類の選択は forest と同様に別ハッシュで決める。
2. 草と樹冠：`onBeforeCompile` で、高さの2乗に比例しワールド位相を持つ風揺れを入れる（共有の time uniform）。草は60m より先で頂点を縮退させ、断片の数を減らす。`FOREST_BUDGET` の描画数・三角形数は維持する。

## Phase 5：大気と空
1. 新規 `dist/atmosphere.mjs`：`skyColor(dir)` と `heightFog(...)` の共有 GLSL と共有 uniform（sunDir、fogColor、海面密度 .00019、高度減衰、太陽方向の散乱色）。
2. 最初のコンパイル前に `T.ShaderChunk.fog_*` を差し替える。world 位置の varying を使い、光線に沿った高さフォグを解析的に積分し、太陽方向の inscatter を加える。海面高度での色と量は現行の FogExp2 と一致させ、高度を上げるほど澄むようにする。
3. 空：sin の帯を2オクターブのノイズ雲に置き換え、ゆっくり流す。地平線の色はフォグ色に合わせる。出力行 `gl_FragColor=sRGBTransferEOTF(...)` は維持する（`test-render-color` が固定している）。

## Phase 6：海面の刷新と吹き下ろし波紋
1. 海：`PlaneGeometry(80000,80000,1,1)`（エイリアスしていた頂点変位を削除）。フラグメントでは次を計算する：
   - Open Water の `waves()` を Z-up・メートル単位に移植する。本数は tier の define で決め、footprint で early break する。
   - Schlick フレネル、`skyColor` による反射、glint と sheen。
   - CPU で焼いた256²の R8 海岸水深テクスチャ（8km 範囲）から深さ→浅瀬の色と、時間で動く波打ち際の泡を作る。
   - 共有の高さフォグを適用し、sRGB の出力行は維持する。
   - 衝突は従来どおり平均海面。
2. 新規 `dist/prop-wash.mjs`（float/half-float のカラーバッファがある時だけ有効）：
   - 256²の RGBA16F ピンポン。24m の領域を機体中心でテクセルにスナップしてスクロールする（Open Water の `uShift`）。
   - 水上かつクリアランス4m 未満の間だけ動かし、減衰用に約3秒延長する。それ以外は sim パスごと省き、負荷はゼロになる。
   - 注入量はスロットル/(高度+0.3) に比例させ、着水（DITCHED）時に飛沫を入れる。
   - 海シェーダは領域内で勾配を加算し、縁と遠方でフェードさせる。

## Phase 7：機体モデル（5機種）
- `dist/vehicle-catalog.mjs`：
  - シェルはクリアコート付きの `MeshPhysicalMaterial`。カーボンは64²の手続き織り目と roughness マップ。モーターとレンズには既存の `skyEnvironment` envMap。
  - ダクトは円筒＋トーラス2本から、丸いリップの `LatheGeometry` に置き換える。
  - アーム端とモーターベルを整える。
  - 回転中はプロペラ円盤（放射グラデーション、半透明）を表示してブレードを隠す。インスペクタの低速回転時はブレードを表示する。
- 全体の寸法（`test-airframes` の bounds 値）は保つ。ジオメトリのハッシュ、Torus と開いた円筒の数、名前付き部品のアサートは新しい構成に合わせて更新する（名前付き部品は残す）。

## Phase 8：適応品質制御
- 新規 `dist/render-quality.mjs`：
  - 初期 tier は coarse pointer、DPR、`maxTextureSize` から決める。`?quality=low|medium|high|auto` で指定できる。
  - コスト `I` = EMA(frameMs) / refreshMs。refresh は起動直後の間隔の下位10%を60/90/120/144 にスナップする。pause 中、非表示中、250ms 超の停止は除外する。
  - 段階（上から）：CHASE の MSAA 4→0（デスクトップ tier のみ）、CHASE の解像度 1.0→0.85→0.72→0.6、海の波 16→10→6、影マップ 2048→1024。
  - `I>1.2` が1.5秒続いたら1段下げ、`I<0.9` が5秒続いたら1段上げる。変更の間隔は最低3秒あける。
  - 解像度と MSAA は段階が変わった時だけ `setSize`/再確保する。FPV は既存の576ライン上限のままにする。
- profile のスナップショットにレベル履歴を追加する。新規 `test-render-quality.mjs` で、合成したフレーム列から段階遷移、ヒステリシス、滞留、pause の除外を決定的に検証する。`test-chase-signal` の CHASE target サイズ期待値は `ratio×scale` に更新する（FPV 部分とシェーダハッシュは不変）。

## 主な変更ファイル
- 変更：`dist/main.mjs`、`dist/render-color.mjs`、`dist/flight-selector.mjs`、`dist/selection-integration.mjs`、`dist/surface-patterns.mjs`、`dist/surface-materials.mjs`、`dist/forest-visuals.mjs`、`dist/vehicle-catalog.mjs`、`dist/render-profile.mjs`、`package.json`（check と test に新モジュールを追加）、`README.md`、`docs/render-performance.md`（新規）
- 新規：`dist/render-depth.mjs`、`shadow-scheduler.mjs`、`static-batch.mjs`、`terrain-lod.mjs`、`atmosphere.mjs`、`prop-wash.mjs`、`render-quality.mjs`、および各新規モジュールに対応する `test-*.mjs`
- 期待値を更新するテスト：`test-render-surfaces`、`test-terrain-visuals`、`test-ground-output`、`test-surfaces`、`test-airframes`、`test-chase-signal`（サイズのみ）、`test-forest-visuals`、`test-painted-materials`（必要な場合）

## 検証
- 各フェーズの最後に `npm test && npm run check` を実行し、全テストが通ることを確認する。
- 内蔵ブラウザ（`npm start` → http://localhost:4173/?profile=1）で6ポーズ×FPV/CHASE のスクリーンショットと `tinyWhoopProfile.capture()` を取り、Phase 0 の値と比べる。目標は、飛行場の描画コール 約500→100未満、島上空の地形描画の削減、見た目の劣化なし。
- `?depth=log` と reversed で影、地面レイヤー、遠景がちらつかないことを比べる。`resize_window` の mobile プリセット（coarse pointer）でも同じ確認をする。
- `?quality=low/high` の固定と auto の遷移をコンソールで確認する。水上の低空ホバーで波紋が出ることと、高度を上げると sim パスが止まることを、描画コールの差で確認する。
- 実機（iPhone）の FPS は環境上計測できない。計測できない旨は README と docs に明記する。コミットはユーザーの指示があってから行う。
