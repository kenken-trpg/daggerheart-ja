# 日本語訳の運用メモ

`lang/ja.json` は上流 (Foundryborne/daggerheart) の `lang/en.json` を追従して維持する。
作業は `tools/lang-sync.mjs` で行う。

> **このファイルはシステムフォーク
> ([kenken-trpg/daggerheart](https://github.com/kenken-trpg/daggerheart)) から
> 引き継いだ。** 用語集・Babele・CSS・実機テスト・ライセンスの各節はそのまま
> 有効だが、**「配布」節以降はフォーク時代の経緯**であり、現在の構成
> (公式システム + 本モジュール) には当てはまらない。モジュールへ移った理由と
> 工程は「再撤回: A (翻訳モジュール) へ移る」節にある。

## 上流追従はマージではなく参照の引き直し

フォークだったときは上流を `git merge` して競合を解消していた。モジュールは
上流のファイルを1つも持たないので、**マージが要らない**。原文を引き直すだけ。

```bash
npm run reference          # 上流 main の lang/en.json を取得して版を固定
npm run lang:report        # 訳の差分を確認
npm run lang:prepare       # → lang/translation/pending.json を埋める
npm run lang:apply
git push origin main       # origin = kenken-trpg/daggerheart-ja
```

特定の版に合わせたいときは `node tools/fetch-reference.mjs 2.10.9` のように
タグを渡す。取得した版は `lang/.reference/pinned.json` に記録される。

```json
{ "upstream": "Foundryborne/daggerheart", "ref": "main", "version": "2.10.9",
  "keys": 2285, "fetched": "2026-10-04" }
```

`lang/.reference/` は gitignore している。上流の成果物であって本リポジトリの
成果物ではなく、持つと真実の所在が2つに増えるため。

### 原文の書き換えは `report` では出ない (既知の穴)

`report` が見るのは**キーの増減**と英語フォールバックだけで、**キーが同じまま
英文が書き換わった場合は検出できない**。古い訳が黙って残る。

当面は原文そのものを差分して確かめる。

```bash
# 直前に追従した版と、いま引いた版の原文を比べる
diff <(git show HEAD:lang/.reference/en.json) lang/.reference/en.json
```

ただし `lang/.reference/` は gitignore なので `git show` は使えない。
追従する前に `cp lang/.reference/en.json /tmp/en.prev.json` で退避しておくこと。
**`lang-sync.mjs` に原文のハッシュを持たせて検出するのが本筋**だが、未実装。

*2026-10-04 時点: 上流 2.10.7 と 2.10.9 の `en.json` は内容が完全一致で、
訳の追従は不要だった (全 2,285 キー、未訳 0)。*

## 翻訳同期ツール (`tools/lang-sync.mjs`)

```bash
node tools/lang-sync.mjs report    # en.json との差分状況を確認
node tools/lang-sync.mjs prepare   # 未訳分を lang/translation/pending.json に書き出す
node tools/lang-sync.mjs diff      # 外部日本語訳と既訳が食い違うキーを書き出す
node tools/lang-sync.mjs apply     # pending.json を ja.json に反映し、en.json のキー順で再構築
```

`prepare` は、既に `ja.json` にある英文→和文の対応と `lang/translation/glossary/*.csv`
を突き合わせ、既知の文言を自動で埋める。残った空欄だけを訳せばよい。
`apply` は上流で削除されたキーを落とし、キー順を `en.json` に揃える。

ネットワークアクセスは一切しない。用語集は手でコミットする CSV なので、
どの文言をどこから採ったかが必ず git 履歴に残る。

## 外部訳との差分検出 (`diff`)

`prepare` は**未訳キーしか見ない**。`ja.json` が全キー埋まっている通常の状態では、
用語集を追加しても `prepare` の出力は 0 件になる (既訳が用語集より優先されるため)。
外部の日本語訳を既訳と比べて見直すには `diff` を使う。

```bash
npm run lang:diff                                   # 全用語集 vs ja.json
node tools/lang-sync.mjs diff --only=shiropanda     # 特定の出典だけと比較
node tools/lang-sync.mjs diff --only=shiropanda --adopt
```

用語集の訳と現行 `ja.json` の訳が食い違うキーだけを `pending.json` に書き出す。
各エントリは次の形で、**現行訳と提案訳の両方が見える**:

```json
"DAGGERHEART.GENERAL.damageType": {
    "en": "Damage Type",
    "current": "ダメージタイプ",
    "suggest": "ダメージ種別",
    "source": "daggerheart-ja.csv",
    "ja": ""
}
```

- `ja` が空のエントリは `apply` が**無視する**。既定では何も変わらない。
- 採用するものだけ `suggest` を `ja` にコピーして `apply`。
- `--adopt` は `ja` に提案訳を入れた状態で出力する。却下するものを空にする運用。
- `--only=<文字列>` はファイル名が部分一致する用語集だけを読み込む。出典ごとに
  単独で比較できるので、複数の用語集が重なって上書きされた結果を見ずに済む。
- 比較は正規化後に行う (大小文字・空白・ダッシュ・引用符・末尾句点)。
  句読点の揺れだけのものは一覧に出ない。

**一括採用はしない前提の設計**。英語文字列でマッチするため、文脈を持たない用語集を
当てると誤訳が混ざる。実際に手元の用語集で試すと `Hide` → 「非表示」(正しくは「隠れる」)、
`Long` → 「長期」(武器の射程なので「長射程」) が提案として出る。
1件ずつ採否を決めるのはこのため。

## 用語集 (`glossary/`)

1ファイル = 1出典の CSV。1列目に英語、2列目に日本語。3列目以降は備考として無視される。
1行目はヘッダとして読み飛ばす。BOM 付きでもよい。外部訳を起こす際も必要なのは
この2列だけで、`en.json` のキー列はなくてよい (キーではなく英語文字列で突合するため)。
ファイル名の昇順で読み込み、後のファイルが前のファイルを上書きする。`diff --only=` で
出典を1つに絞る運用を考えると、ファイル名は出典が分かる形にしておく。

| ファイル | 行数 | 出所 |
| --- | --- | --- |
| `daggerheart-ja.csv` | 1531 | 本リポジトリ独自の訳。`en.json` の文言を種に訳したもの |

`daggerheart-ja.csv` は手元の `lang/Daggerheart_en-ja.csv` から
**D&D 列を除いて**作成したもの。1列目=英語、2列目=日本語、3列目=`en.json` のキー（参考）。

## 外部の対訳資料から用語集 CSV を起こす (設計)

**未実装。** 外部の日本語訳を取り込む許諾が得られた時点で書く。出典ごとに
スクリプトを書き捨てるのではなく、下記を共通の設計として踏む。

### 入力の型を見極める

対訳資料は大きく2型あり、必要な労力が桁で違う。**先に型を判定する。**

| 型 | 構造 | 必要な処理 |
| --- | --- | --- |
| 対訳併記型 | 原語と訳語が同一ページに併記されている | 抽出のみ |
| 訳文単独型 | 訳語しかない | 原典との対応付けが別途必要 |

併記型は、見出しや用語ラベルに原語を添える実装が多い
(`<h3>訳語<span class="en-sub">English</span></h3>` のような形)。
この場合は次の1規則で全件取れる:

> 原語を囲む要素の中身 = 英語。**その親要素のテキストから当該要素を除いた残り** = 日本語。

原語がどの要素・クラスに入るかは出典ごとに違うので、**セレクタは引数で与える**。

訳文単独型は原典との対応付けが必要で、費用対効果が落ちる。見出し構造や
`id` 属性に原語スラッグが残っていればそこを手がかりにできるが、
残っていなければ用語単位の手作業に近くなる。無理に自動化しない。

### HTML は必ずパーサで読む

正規表現で親要素を特定しようとすると**壊れる**。入れ子とタグ境界を取り違えて、
ページ全体を訳文側として拾う。Node なら DOM パーサを使う
(`tools/*.mjs` の依存を増やしたくなければ、取得済み HTML を Python の
`html.parser` で前処理する手もある)。

### 投入先は2系統あることを忘れない

本リポジトリの訳出対象は `lang/ja.json` だけではない。

| 投入先 | 規模 | 内容 |
| --- | --- | --- |
| `lang/ja.json` | 2285キー | UI 文言 |
| `src/packs/*/*.json` の `name` 等 | 1821ファイル | 能力カード名・クラス名・血統名・敵キャラクター名などのゲーム内容 |

SRD の訳は**ゲーム内容の名称に厚く、UI 文言には薄い**。したがって外部訳を当てると
`lang/ja.json` への命中より packs への命中のほうが大きくなる。
CSV は投入先ごとに分けて出力する:

```text
tools/srd-ja-extract.mjs <input.html> --en-selector=<...> --out-dir=lang/translation/glossary/
  ├→ <出典>-ui.csv      → lang-sync の diff --only=<出典> でレビュー
  └→ <出典>-packs.csv   → packs 用 (投入機構は別。CSV 生成までを範囲とする)
```

`lang/ja.json` 側は既存パイプラインにそのまま乗る。packs 側は投入機構が異なるので、
**抽出と投入を分離し、まず CSV までを作る**。投入機構は
「コンペンディウム (packs) の翻訳方式」の節を参照。

### スクリプトの約束事

- **入力はローカルファイル。スクリプトにネットワーク処理を持たせない。**
  取得は `curl` で人間が行い、HTML をパス引数で渡す。`lang-sync.mjs` と同じ方針で、
  取得日と版の記録を人の手に残すため。
- **版を固定して記録する。** 取得日と入力ファイルの SHA256 を出力 CSV の
  ヘッダ行かコメントに残す。未完成の資料は後から加筆されるので、
  再取得したときに差分だけを追えるようにしておく。
- **出典内の自己矛盾は報告して落とす。** 同じ原語に別の訳語が当たっている箇所は
  実在する。後出し勝ちで黙って潰すと、出典内の不整合をそのまま持ち込む。
- **正規化は `lang-sync.mjs` の `normalize()` と同一にする。** 揺れの判定基準が
  ツール間でずれると、`diff` の出力が信用できなくなる。
- **未整備セクションを確認する。** 進行中の訳は一部の章が空であることが多い。
  どの範囲が埋まっているかを記録し、CSV の規模から判断しない。

### 抽出したあと

CSV を `glossary/` に置き、`diff --only=<出典>` で既訳との食い違いを見る。
一括採用はしない (理由は「外部訳との差分検出」の節)。食い違いは**語ごとに
体系的に固まる**傾向があり、キー単位より先に**用語単位で方針を決める**ほうが速い。

## コンペンディウム (packs) の翻訳方式 (未着手・方式比較)

`lang/ja.json` は UI 文言のみを扱う。**ゲーム内容は別の機構が必要**で、まだ何も
入っていない。下記は着手前の方式比較と、調査時点 (2026-10) の実測値。

### 現状

| 対象 | 規模 | 日本語化 |
| --- | --- | --- |
| `lang/ja.json` (UI 文言) | 2,285文字列 / 69,510文字 | 100% (未訳0・英語フォールバック0) |
| `src/packs/**/*.json` (ゲーム内容) | **11,505フィールド / 980,122文字** / 1,820ファイル | **0%** (日本語を含むファイル0件) |

内容側は UI の約14倍。画面上は「枠は日本語、中身は英語」になる。

> **数値を上方修正した。** 以前ここには 8,916文字列 / 601,861文字 と書いていたが、
> `items[]`(アクターに埋め込まれた機能アイテム)配下の `system.description`、
> `effects[].description`、`journals` の `pages[].text.content` を数えていなかった。
> 埋め込みアイテムの説明文だけで 296,051文字あり、これは最大の単一項目である。

パック別 (文字数 / フィールド数):

| パック | 文字数 | フィールド | パック | 文字数 | フィールド |
| --- | --- | --- | --- | --- | --- |
| `adversaries` | 315,420 | 5,095 | `items/weapons` | 22,527 | 1,226 |
| `journals` | 208,012 | 39 | `items/loot` | 20,315 | 348 |
| `environments` | 139,154 | 933 | `beastforms` | 12,319 | 265 |
| `domains` | 132,649 | 1,271 | `ancestries` | 11,379 | 211 |
| `subclasses` | 46,754 | 710 | `items/armors` | 5,770 | 266 |
| `items/consumables` | 25,850 | 496 | `communities` | 5,667 | 92 |
| `classes` | 25,228 | 225 | `rolltables` | 5,073 | 279 |
| | | | `transformations` | 4,005 | 49 |

`journals` は 39フィールドで 208,012文字 — SRD のルール本文そのもので、
1フィールドあたり5,000文字を超える。他のパックとは作業の性質が違うので、
工程も分けて考える (後述)。

### 方式選択では減らない固定費

- **翻訳量は方式に依らない。** 上記の 601,861文字はどの方式でも同じ。
- **上流の packs は激しく動く。** 直近90日で 1,644ファイルが変更、666が新規追加、
  21削除。どの方式でも「訳が常に遅れる」前提の運用と、カバー率を測る仕組みが要る。
- **Foundry コアはコンペンディウムの中身を翻訳できない** (UI 要素のみ)。
  仕様上の制約なので、追加機構は必須。
- **`packs/` は gitignore され、リリース時に `deploy.yml` が `src/packs/*.json` から
  LevelDB をビルドして `system.zip` に同梱する。** ビルド成果物に手を入れる方式は
  「システム本体を自分で配布する」ことを意味する。

### 比較

| | A. Babele モジュール | B. ビルド時注入 | C. src/packs 直接和訳 | D. 自前ランタイム注入 |
| --- | --- | --- | --- | --- |
| 実装場所 | 別リポジトリ (モジュール) | `pullYMLtoLDB.mjs` の `transformEntry` | `src/packs` を直接編集 | システム内に i18n レイヤ |
| 上流マージの競合 | **ゼロ** (本体に触らない) | 小 (ツール1ファイル) | **1,160ファイルが毎回** | 中 |
| 配布形態 | 公式システム + モジュール | フォーク版システム全体を自前リリース | 同左 | 同左 |
| ユーザーの手間 | Babele + 訳モジュールを入れる | なし | なし | なし |
| 英日の切り替え | ランタイムで可 | 不可 (ビルドで固定) | 不可 | 可 |
| 既存エコシステム | 確立 (dnd5e 等で多数実績) | 前例なし | — | 車輪の再発明 |

**C は却下。** 90日で1,644ファイルが動く対象を直接編集すると、追従コストが
翻訳コストを上回る。**D も却下。** Babele が既にやっていることを自前で持つ理由がない。

**B の評価**: 競合は小さく技術的には成立する (`transformEntry` は注入点として素直) が、
得られるのは「ユーザーがモジュールを入れなくて済む」だけで、代わりに
システム全体の自前リリースと上流リリース追従の責任を負う。費用対効果が合わない。

### 推奨: A (Babele モジュール)

[Babele](https://foundryvtt.com/packages/babele) は調査時点で 2.9.1、
minimum v13 / verified v14 / maximum v14。本リポジトリの
`compatibility.minimum: 14.364` と合致する。

動作は「JSON 設定ファイルから訳を取得し、**元のコンペンディウムを書き換えず
メモリ上でマップされたプロパティを上書きする**」方式。pack の複製を持たずに済む。

決め手は**上流マージの競合がゼロになる**こと。本体リポジトリに触らないので、
現在の追従作業がこれ以上重くならない。

なお開発環境の Foundry には Babele 2.9.1 が既にインストール済み
(`Data/modules/babele`)。「ユーザーに導入の手間をかける」という A の唯一の
短所は、少なくとも手元では既に払い終わっている。

### A を選ぶとフォーク自体が不要になりうる

モジュールの `module.json` の `languages` 配列には**オプションの `system` フィールド**が
あり、モジュールが他のシステムのキーに訳を提供・上書きできる (同じキーを持つ訳を
提供することで上書きされる)。つまり `lang/ja.json` もモジュール側へ移せる:

```text
公式 Foundryborne/daggerheart (フォークしない)
  + Babele
  + daggerheart-ja モジュール
      ├ lang/ja.json       ← UI 文言 (現在フォークにあるもの)
      └ babele/*.json      ← pack 訳
```

この形なら上流追従そのものが消える。`lang-sync.mjs` と `glossary/` はそのまま
モジュール側へ持っていける。

**検証済み (2026-10)。** v14 本体のソースで確認した。コミュニティ Wiki ではなく
インストール済みの Foundry v14.365 の実装そのもの:

`common/packages/_types.mjs` の `PackageLanguageData`:

```
@property {string} [system]  Only apply this set of translations when a specific
                             system is being used
```

`client/helpers/localization.mjs` の `#getTranslations()` は**この順で読み込み、
`mergeObject` でマージする**:

```
1. コア          lang/<lang>.json
2. システム      game.system の languages
3. モジュール    有効な全モジュールの languages
4. ワールド      game.world の languages
```

同じ `#filterLanguagePaths()` が `l.system === game.system.id` を判定している。

つまり**モジュールはシステムより後に読まれ、キー単位で上書きする**。
`languages: [{ lang: "ja", path: "lang/ja.json", system: "daggerheart" }]` を
持つモジュールを入れれば、公式システムの `lang/ja.json` を置き換えられる。
**UI 文言のためにフォークを維持する必要はない。**

### 設計 (Babele 2.9.1 のソースを読んで確定させたこと)

ここまで「要確認」としていた項目を、インストール済みの Babele 2.9.1
(`Data/modules/babele/script/`) を読んで決着させた。**実装はまだしていない。**

#### キーは `_id` にする (最優先項目・解決)

Babele は「エントリ名で引く」と理解していたが、2.9.1 には
`DocumentIdentity` (`script/identity/document-identity.js`) があり、既定値は:

```js
export: ["name", "_id", "id"]   // 訳ファイルを書き出すときのキー
match:  ["_id", "name", "sourceId"]   // 訳を引くときに試す順
```

つまり**照合は既定で `_id` が最優先、名前はフォールバック**。
ドキュメント型ごとに `_identity` で上書きできる (コア側では `TableResult` が
実際にそうしている)。本リポジトリでは明示的にこう置く:

```json
"_identity": { "export": ["_id"], "match": ["_id", "name"] }
```

- `export` を `_id` のみにすると、訳ファイルのキーが ID になる。
  上流が英語名を変えても訳が外れない。90日で666件追加される対象なので、ここが効く。
- `match` に `name` を残すのは、ID が変わった(= 作り直された)ドキュメントを
  旧名で拾える保険。外れたら未訳として見えるので、害はない。
- 代償は**訳ファイルが人間に読めなくなる**こと。
  `"lmBLMPuR8qLbuzNf": { "name": "安息の地" }` では差分レビューができない。
  各エントリに `"_note": "<英語原文>"` を併記する方針にする
  (Babele はマッピングにないキーを無視する)。これは書き出しツール側の仕事。

#### 入れ子の連想配列には `structured` コンバータが要る

Daggerheart のデータは、訳すべきテキストが**ランダム ID をキーにした
連想配列の中**にある。これが dnd5e などの既存訳モジュールと一番違う点:

```
.system.actions.<16桁ID>.name          711件
.system.actions.<16桁ID>.description   279件 / 48,036文字
.system.experiences.<16桁ID>.name      287件
.items[].system.actions.<16桁ID>.name  874件
```

配列ではないので `nameCollection` 系では扱えない。2.9.1 の
`structured` コンバータ (`script/converter/structured-data-converter.js`) が
**キー付きコンテナ**に対応していて、既定で `sourceKey` (= そのランダム ID) で
照合し、`key` / `keys` オプションで値の中のプロパティ (例 `name`) に
切り替えられる。ここは `sourceKey` のまま使う — ID で引く方針と揃う。

#### 必要なマッピングの全体像

実測したフィールド出現数から、最低限これだけ要る:

| パス | 件数 | コンバータ |
| --- | --- | --- |
| `name` / `system.description` | 1,820 / 1,127 | 既定 |
| `system.motivesAndTactics` | 264 | 既定 |
| `items[]` (埋め込みアイテム) | 1,108 | `document` (cardinality many) |
| `effects[]` | 534 | `document` → `ActiveEffect` |
| `system.actions.<id>` | 711 | `structured` |
| `system.experiences.<id>` | 287 | `structured` |
| `system.attack.name` | 588 | 既定 |
| `system.actions.<id>.areas[].name` | 250 | `nameCollection` |
| `system.advantageOn.<id>.value` | 64 | `structured` |
| `effects[].system.changes[].value` | 215 | **要選別** (下記) |
| `pages[].text.content` (journals) | 18 | `pages` |

`items[]` と `effects[]` は入れ子なので、その中でも `system.actions.<id>` の
マッピングが再帰的に必要。**マッピング定義は1つのファイルに書いて
`Item` / `Actor` の両方から参照する**構成にする。

#### 訳してはいけないフィールド

機械的に「文字列なら訳す」とやると壊れる:

- **`system.weaponFeatures[].value`** (207件) / **`armorFeatures[].value`** (65件)
  — 実データを確認したところ中身は `paired` / `heavy` / `flexible` / `bulky` といった
  **小文字の列挙キー**だった。表示名は UI 側 (`lang/ja.json`) で解決される。
  **訳の対象外。** 272フィールドがここで落ちる。
- **`effects[].system.changes[].value`** (157件+58件) — **自由文と数式が混在していた。**
  一括で扱えない:
  ```
  2*@system.traits.strength.value*@stacks          ← 数式。訳すと効果が壊れる
  -max(ORIGIN.@system.traits.knowledge.value,1)    ← 同上
  On Attacks                                        ← 自由文。訳す対象
  Presence Rolls to socialize with other revelers   ← 同上
  ```
  `@` を含む / 算術記号のみで構成される値を数式として機械的に弾き、
  **残りは必ず目で確認する**。`system.conditionals[].value` (23件) は確認した限り
  全て数式だったが、同じ判定を通す。
- **`_key`** — LevelDB のキー (`!actors.items!<id>.<id>`)。データ構造。
- **説明文中の Foundry エンリッチャ** — `@Lookup[@name]`、`@UUID[...]{...}`、
  `[[/dr ...]]` など。`@Lookup[@name]` は adversaries の説明文に多数ある。
  **角括弧の中は原文のまま残し、表示ラベル部分だけ訳す。**
  訳者向けのチェックとして、原文と訳文でエンリッチャの出現を機械比較する。
- `system.advantageOn.<id>.value` (64件) — `Attack` / `Sneak` / `Locate` /
  `Navigate` など15語程度の語彙が繰り返し出るだけ。訳す対象だが、
  **`glossary/` に入れれば実質ゼロコスト**。UI 側の既存訳と必ず揃える。

### 工程 (見積もり込み)

| # | 内容 | 規模 | 目的 |
| --- | --- | --- | --- |
| 0 | 書き出し・取り込みツールを書く | — | 以降すべての前提 |
| 1 | `transformations` で実証 | 4,005字 / 49 | マッピングが成立するか |
| 2 | `communities` + `ancestries` | 17,046字 / 303 | 入れ子 `items[]` の検証 |
| 3 | `items/*` 4パック | 74,462字 / 2,336 | 件数が多く1件が短い型 |
| 4 | `domains` + `subclasses` + `classes` + `beastforms` | 216,950字 / 2,471 | プレイヤー側が完成する |
| 5 | `adversaries` + `environments` | 454,574字 / 6,028 | 全体の46%。最後に回す |
| 6 | `journals` | 208,012字 / 39 | 下記の通り別扱い |

工程1〜2が「方式が成立するか」の判定で、ここまでで打ち切れる。
工程3以降は純粋な翻訳量なので、分割して継続的に進める形にする。

**工程6 (`journals`) は性質が違う。** 中身は Daggerheart SRD のルール本文で、
1フィールド5,000文字超の長文。他のパックが「用語を揃えて短文を訳す」作業なのに対し、
これは「ルールブックを翻訳する」作業。かつ**ライセンスの検討が別途必要**
(SRD は DPCGL 下にあり、本リポジトリのライセンス構造は後述)。
他のパックと同じ工程に並べず、**着手の可否を別に判断する。**

### ツール側で用意するもの (工程0)

`tools/lang-sync.mjs` と同じ発想で、packs 用に3つ:

1. **書き出し** — `src/packs/**/*.json` を走査して Babele 形式の訳テンプレートを生成。
   キーは `_id`、各エントリに `_note` として英語原文を併記。
   既存の訳があれば保持する (`lang:apply` と同じ「落とさない」保証)。
2. **カバー率レポート** — パック別に「訳済み / 未訳 / 上流から消えた」を出す。
   666件/90日の追加に追従するため**必須**。`lang:report` と同じ出力形式に揃える。
3. **整合性チェック** — 原文と訳文でエンリッチャ (`@Lookup`、`@UUID`) の
   出現が一致するか、訳してはいけないフィールドに手が入っていないかを検証。

`glossary/` は packs でもそのまま使う。むしろ UI より効く — 同じ用語が
980,122文字の中に散るので、揃っていないことが目立つ。

### 残っている未検証項目

- **既存ワールドへの影響。** Babele は閲覧・インポート時にのみ訳を当てる。
  既にワールドへインポート済みのドキュメントは遡って翻訳されない。
  ユーザーへの告知事項。
- **`src/packs` の `_stats.coreVersion` が 14.366/14.367** のため、
  それより古いコアでは journals / rolltables の移行が失敗する (実機テストで確認済み)。
  Babele 検証は `verified` の 14.368 で行う。

## 配布 (マニフェスト URL でのインストール)

**現状、このフォークは URL インストールできない。** `system.json` は URL 上に
存在する (`https://raw.githubusercontent.com/kenken-trpg/daggerheart/main/system.json`、
HTTP 200) が、Foundry に食わせても日本語版は入らない。

| 項目 | 現状 | 問題 |
| --- | --- | --- |
| `manifest` | `.../Foundryborne/daggerheart/v14/system.json` | **上流を指している** |
| `download` | `.../Foundryborne/.../2.10.7/system.zip` | **上流の zip を落とす** |
| フォークのリリース | **0件** | 落とす zip が存在しない |
| フォークの `v14` ブランチ | 2.7.4 / `ja` なし | 古い。`main` が作業ブランチ |

Foundry はマニフェストを読んだあと `download` の zip を取得するので、
現在の `system.json` を指定すると**上流の英語版がインストールされる**。

### `id` の衝突

`system.json` の `id` は `daggerheart` のまま。Foundry はシステムを `id` で
識別するので、公式版とフォーク版は**共存できない**。フォークを入れると公式版が
置き換わり、以後は上流の更新通知と自前の更新がぶつかる。

> **その後解消した。** `id` を `daggerheart-ja` に変えて共存できるようにした。
> 経緯と書き換え範囲は「撤回: `id` を `daggerheart-ja` に変えた」を参照。

### フォークが上流と違っている中身

選択肢を比べる前に、「何を運ぶ必要があるのか」を実測する。
`git diff origin/main..main` は17ファイル / 7,037行だが、**2種類しかない**:

| 種別 | ファイル | 移設先として成立するか |
| --- | --- | --- |
| 翻訳データ | `lang/ja.json` (4,435行)、`lang/translation/**`、`tools/lang-sync.mjs`、`system.json` の `languages`、`package.json` のスクリプト、`.gitignore` | モジュールへ移せる |
| CSS 修正 | LESS 7ファイル / 13行 (日本語の潰れ対策) | **下記の通り、モジュールでも可能** |

`module/` 配下に出ている差分 (`ruler.mjs`、`tokenRuler.mjs`、`scene.mjs`) は
**自分の変更ではない。** フォークが上流より3コミット遅れているために、
上流が後から変えた箇所が「フォーク側だけにあるもの」として出ているだけ。
上流をマージすれば消える。**自分のコミット18件は全て翻訳と CSS。**

### モジュールの CSS はシステムの CSS に勝つ (検証済み)

CSS 修正をモジュールへ移せるかは、優先順位で決まる。v14 は
**CSS カスケードレイヤ**を使っていて、`public/css/foundry2.css` の冒頭で
レイヤ順が宣言されている:

```css
@layer reset, variables, elements, blocks, applications,
       compatibility, layouts,
       system,      /* 8. Default game system styles */
       modules,     /* 9. Default module styles */
       exceptions;
```

`dist/server/views/view.mjs` の `_getStaticContent()` は、システムの
`styles` を既定で `system` レイヤ、モジュールの `styles` を既定で
`modules` レイヤに入れる。

**レイヤはセレクタの詳細度より強い。** `modules` は `system` より後なので、
モジュール側の CSS は**詳細度が低くても必ず勝つ**。
`white-space: nowrap` 13行をモジュールから当てられる。

ただし上流がセレクタを変えると当たらなくなる (静かに効かなくなる)。
CSS は上流の不具合なので、**モジュールで上書きするより PR で直すほうが本筋**。

### 選択肢

| | A. 翻訳モジュール | B. フォークをシステムとして配布 | C. 上流へ PR | D. 現状維持 |
| --- | --- | --- | --- | --- |
| 配布物 | `daggerheart-ja` モジュール | フォーク版システム一式 | なし (上流に入る) | なし |
| インストール | マニフェスト URL 1本 | マニフェスト URL 1本 | 公式システムに同梱 | `git clone` + シンボリックリンク |
| `id` 衝突 | **なし** | **あり** (公式版を置き換える) | なし | なし |
| 上流追従 | `lang:apply` のみ | **リリースごとに全体** | **ゼロ** | `lang:apply` のみ |
| 前提 | Babele (packs 訳をやる場合) | なし | 上流が受け入れること | 自分だけ |
| 他の人が使えるか | はい | はい | **全ユーザー** | いいえ |

#### A. 翻訳モジュール (`daggerheart-ja`)

**Pros**

- **`id` が衝突しない。** 公式システムと共存し、入れる/切るで日英を切り替えられる。
- **上流追従が翻訳だけに縮む。** システム本体のマージ作業が消える。
  現在の「上流を merge して競合を見る」運用そのものが不要になる。
- 検証済みの仕組みだけで成立する — `languages[].system` の上書き、
  `modules` カスケードレイヤ、Babele 2.9.1。どれも推測ではない。
- packs 訳 (Babele) と UI 訳を**1つのモジュールに同梱**できる。
- 配布がマニフェスト URL 1本で済む。

**Cons**

- **CSS の上書きが静かに壊れうる。** 上流がセレクタを変えても
  エラーは出ず、日本語が潰れた状態に戻るだけ。気づくには実機走査が要る。
- **CSS 以外の上流不具合は直せない。** `label: 'Image'` のような
  `.mjs` 内のハードコードは、モジュールからは手が出ない
  (翻訳機構を通っていないので上書き対象がない)。C が必要。
- packs 訳をやるなら**ユーザーに Babele の導入を求める**。
- 新しいリポジトリを1つ増やすことになる。

#### B. フォークをシステムとして配布

**Pros**

- ユーザーの手間が最小 — システムを入れるだけ。Babele も不要にできる。
- `.mjs` のハードコードも CSS も**自分で直せる**。上流の受け入れを待たない。
- packs 訳をビルド時に焼き込める (方式比較の B)。

**Cons**

- **`id` が `daggerheart` のまま衝突する。** 公式版と共存できず、入れると
  置き換わる。以後、上流の更新通知と自前の更新がぶつかる。
  `id` を変えれば回避できるが、**既存ワールドが壊れる**。
- **上流リリースへの追従責任を負う。** 上流が出すたびにマージ・ビルド・
  リリースが必要。packs は90日で1,644ファイル動いている。
- バージョンが上流と同じ `2.10.7`。採番規則を決めないと区別がつかない。
- `deploy.yml` の修正が必要 (`manifest` のブランチが `v14` 固定、作業は `main`)。
- フォーク全体を自分で配ることになり、サポートの窓口も自分になる。

#### C. 上流へ PR — **不可**

上流 `README.md` の **AI Policy** で封じられている:

> The Foundryborne Daggerheart system does not make use of AI (generative or
> otherwise) for any area of its implementation. We expect all contributors to
> follow this same policy when contributing with a pull request;
> **contributions made using AI will be rejected outright.**

このリポジトリの作業はすべて AI 併用なので、**出しても拒否される**。
`lang/ja.json` も CSS 13行も `.mjs` の1語修正も対象外。

`CONTRIBUTING.md` にも別のゲートがある (「開発チームのフィードバックを
受ける前に外部からの貢献を出さないでほしい」= Issue か Discussion を先に立てる)。
こちらは手続きの話なので、AI Policy のほうが決定的。

**影響**: CSS 修正と `.mjs` のハードコードは**自分で持ち続けるしかない**。
A を選んだ場合、CSS はモジュールから上書きし続けることになり、
「上流がセレクタを変えたら静かに効かなくなる」リスクも持ち続ける。

#### D. 現状維持 (手元のみ)

**Pros**

- 追加作業ゼロ。今すでに動いている。
- 試行の自由度が最も高い。壊しても誰にも影響しない。

**Cons**

- **自分以外使えない。** `git clone` とシンボリックリンクが必要。
- 翻訳の品質検証が自分一人のプレイに限られる。
- フォークのマージ作業は続く。

### 結論: B (フォークをシステムとして配布)

希望は「マニフェスト URL でインストールできること」、かつ
**これ以上の開発はしない**。この条件だと B が残る。

- **C は不可。** 上流の AI Policy で拒否される。
- **A (モジュール) は作業が増える。** 新しいリポジトリ、`module.json`、
  `lang/` と `tools/` の移設、CSS のレイヤ上書き、Babele の配線。
  「開発しない」という前提と合わない。
- **B は既にほぼ揃っている。** `deploy.yml` が packs/js/css をビルドして
  `system.json` と `system.zip` を Release に添付するところまで書かれている。
  足りないのは URL の向き先と採番だけ。

#### `id` 衝突の評価を下げた

前の版で「`id` が衝突して上流の更新とぶつかる」と書いたが、**過大評価だった**。
Foundry が更新を確認するのは**インストール済みの `system.json` の `manifest`**
であり、これはフォークを指す。上流を見にはいかないのでぶつからない。

実際に残る制約は2つだけ:

- 公式版とフォーク版を**同時にインストールできない** (`id` が同じなので)。
- ワールドは `system: "daggerheart"` を持つので、**公式版とフォーク版で
  相互に開ける**。これは衝突ではなく利点 (英語版へ戻せる)。

`id` を変えるほうが既存ワールドを壊すので、**`daggerheart` のまま**でよい。

#### 撤回: `id` を `daggerheart-ja` に変えた (2026-10-03)

上の判断を覆した。理由は**併用したい利用者がいる**こと。公式版 (英語) と
日本語版を並べて入れ、ワールドごとに選びたいという要求は、`id` を同じに
している限り原理的に満たせない。

変えた結果、上の Cons のうち「同時にインストールできない」は消え、
代わりに下の2つを受け入れた:

- **既存ワールドは開けなくなる。** ワールドは `system` に ID を持つので、
  `daggerheart` のワールドは `daggerheart-ja` では開かない。移行するなら
  ワールドの `world.json` の `system` を書き換える。
- **公式版へ戻す経路も切れる。** 相互に開けるという利点を失った。

##### 書き換えた対象

| 対象 | 件数 | 備考 |
| --- | --- | --- |
| `systems/daggerheart/` → `systems/daggerheart-ja/` | 1,415 | mjs 389 / hbs 159 / packs の画像パス 867 |
| `Compendium.daggerheart.` / `Compendium[daggerheart.` → `-ja` | 882 | packs 内部の UUID リンク |
| `system.json` の `id` / `title` / `download` | 3 | |
| `system.json` の `packs[].system` | 15 | **見落としやすい。** `daggerheart` のままだとパックがシステム不一致で読み込まれない |
| `tools/pullYMLtoLDB.mjs` の `systemId` | 1 | コンパイル後のパックに焼き込まれる |
| `tools/create-symlink.mjs` の配置先 | 1 | |

##### 書き換えてはいけなかったもの

- **`classes: ['daggerheart', 'dh-style', …]` 47箇所** — これは CSS
  クラス名で ID ではない。変えると全スタイルが外れる。
- `DAGGERHEART.*` の i18n キー — ID とは無関係。
- `build/daggerheart.js` / `styles/daggerheart.css` — ただのファイル名。
  `system.json` の `esmodules` / `styles` もこのまま。
- `url` (`https://github.com/kenken-trpg/daggerheart`) — リポジトリ名は
  `daggerheart` のままなので変えない。
- **`flags.daggerheart`** — シーンの `sceneEnvironments` などが入っている。
  Foundry は生の `update()` 経由なら未登録スコープでも読み書きできるため
  動作し、変えると既存シーンのデータが参照できなくなる。据え置いた。

##### フラグと設定のスコープも ID だった (実機で発覚)

据え置くと判断した `flags.daggerheart` は**間違いだった**。実機でキャラクター
シートを開いた時点で落ちる:

```
Flag scope "daggerheart" is not valid or not currently active
```

Foundry はフラグのスコープを**現在有効なパッケージ ID**で検証するので、
`daggerheart-ja` でなければ通らない。旧システムが同時にインストールされて
いても無関係 (有効なのは起動中のシステムだけ)。

同じ理由で `module/config/system.mjs` の `SYSTEM_ID` も変える必要があった。
これは `CONFIG.DH.id` として**設定の登録109件とシート登録の名前空間**に
使われている。

| 対象 | 件数 |
| --- | --- |
| `flags.daggerheart` → `flags['daggerheart-ja']` ほか | 43 |
| `SYSTEM_ID` | 1 |

ハイフンを含む ID はプロパティアクセスに使えない (`flags.daggerheart-ja` は
引き算に解釈される) ので、**ブラケット記法に書き換えた**。文字列パス
(`'flags.daggerheart-ja.sceneEnvironments'`) と hbs の `name=` 属性は
ドット区切りのままでよい。

Foundry の `validateId` は `/^[A-Za-z0-9-_]+$/` でアンダースコアも許すため
`daggerheart_ja` にすればブラケット記法を避けられたが、ハイフンが慣例なので
そちらを採った。

##### 採番

`id` が変わった時点で別パッケージなので、バージョンは `2.10.7.2` に上げた
(`2.10.7.1` の成果物は旧 `id` を含むため再利用できない)。

#### `id` 変更後の実機確認 (2026-10-03)

隔離データパス (ポート30100) に旧 `daggerheart` 2.10.7.1 と新
`daggerheart-ja` 2.10.7.2 を**両方置いて**確認した。

| 確認項目 | 結果 |
| --- | --- |
| 2システムの共存 | セットアップ画面に両方表示 |
| `game.system.id` | `daggerheart-ja` 2.10.7.2 |
| コンペンディウム15パック | 全て open 可・`packs[].system` も全て `daggerheart-ja` |
| ドキュメント総数 | classes 78 / subclasses 160 / domains 210 / ancestries 72 / communities 30 / weapons 324 / armors 69 / consumables 121 / loot 121 / adversaries 264 / environments 47 / journals 3 / rolltables 5 / beastforms 55 / transformations 18 |
| 書き換えた UUID リンクの解決 | **767/767** (1件は旧形式 `@Compendium[...]` でエンリッチャが補完) |
| 画像パス (15種・のべ867件) | 全て HTTP 200 |
| アクターシート6種 | character / companion / adversary / npc / environment / party **全て描画** |
| アイテムシート12種 | **全て描画** |
| 設定のスコープ | 旧 `daggerheart.*` 0件 / 新 `daggerheart-ja.*` 13件・読み出し可 |
| シート登録の名前空間 | `daggerheart-ja.CharacterSheet` ほか |
| シーンのフラグ往復 | 書き込み・読み出し・シーン設定画面の描画すべて可 |
| 日本語表示とレイアウト | 崩れ 0件 |

残った警告1件は**この変更とは無関係**:

```
TypeError: Failed data migration for DhItem: Cannot read properties of undefined (reading 'armor')
```

`DHArmor.migrateDocumentData` が `source.system` の存在を確認せずに
`source.system.armor` を見ているため。検証で `system` を持たない空の防具
アイテムを作ったときだけ出る。上流から引き継いだもので、通常の操作では
発生せず、シートの描画にも影響しない。

#### 採番

上流は `2.10.8`、フォークは `2.10.7` 基準。**4つ目のセグメント**を足す:

```
2.10.7.1   ← 上流 2.10.7 に日本語化1回目
2.10.8.1   ← 上流 2.10.8 を取り込んだら
```

`common/utils/helpers.mjs` の `isNewerVersion()` は segment を順に比較し、
「前のバージョンにその segment が無ければ新しい側の勝ち」と判定する
(実装で確認済み)。したがって `2.10.7.1` > `2.10.7` が成立し、
上流の `2.10.8` とも混ざらない。

#### 済んだ準備

- `system.json` の `manifest` / `download` / `url` をフォークへ向けた。
  Release を作らなくても**この3行は commit 側に必要** —
  `deploy.yml` の置換は Release 成果物にだけ効き、ブランチ上の
  `system.json` は書き換わらないため。
- `deploy.yml` の `manifest` が `.../${{github.repository}}/v14/system.json` と
  **ブランチを `v14` 固定**していたのを `main` に直した。
  `${{github.repository}}` は自動でフォーク名に化けるので他は触らない。
- `version` を `2.10.7.1` に。

#### インストール URL (2026-10-03 公開済み)

```
https://raw.githubusercontent.com/kenken-trpg/daggerheart/main/system.json
```

Foundry の Setup → Game Systems → Install System に貼る。
確認済み: `version 2.10.7.1` / `languages ['en','ja']` /
`download` の zip が HTTP 200 で 36,319,389 バイト。

#### 配布物の実機確認 (2026-10-03)

> この確認は **`id` が `daggerheart` だった 2.10.7.1** に対して行ったもの。
> `id` を `daggerheart-ja` に変えた 2.10.7.2 では再確認が必要。

公開した URL から**隔離環境へ実際にインストールして**確認した
(別データパス / ポート30100 / 本番の30000には触れていない)。

| 確認項目 | 結果 |
| --- | --- |
| マニフェスト URL からのインストール | 成功 (`Installed system daggerheart`) |
| インストールされたバージョン | `2.10.7.1` |
| `lang/ja.json` の同梱 | 227,203バイト |
| 他者の著作物の混入 | **0件** (`DnD_Glossary` / `en-ja` とも無し) |
| `game.i18n.lang` | `ja` |
| 翻訳の解決 | `DAGGERHEART.GENERAL.evasion` → `回避値` |
| シートの日本語崩れ | character / adversary / environment / companion の4種で **0件** |
| コンペンディウム15パック | 全て open 可、ドキュメント読み出し可 |

`装備` / `ロードアウト` / `経験` が横一行で出ることを目視でも確認した。
**CSS 修正が配布物に乗っている。**

#### 起動時の移行エラーは無害 (ただし出る)

ワールド起動時に8件のエラーが出る:

```
An error occurred during the migration of RollTable record [...] of
database "daggerheart.rolltables":
Error: Documents from a core version newer than the running version
cannot be migrated
```

内訳は `daggerheart.rolltables` 6件 / `daggerheart.journals` 4件
(ログ上の database 名の出現数)。原因は `src/packs` の
`_stats.coreVersion` が 14.366/14.367 で、動かしたコアが 14.365 だから。

**データは失われない。** 確認したところ rolltables は
テーブル5件 + フォルダ2件 = ソースの7ファイルと一致、journals も3件で一致し、
どちらも index から読み出せた。`verified` の 14.368 以降なら出ない。
**上流から引き継いだ性質で、日本語化とは無関係。**

#### フォークでは Release イベントでワークフローが走らない

`2.10.7.1` を publish したが **`deploy.yml` は起動しなかった**。
リポジトリの累計実行数が 0 で、`main` への push 5回でも `ci.yml` が
1件も走っていない (`ci.yml` は `push: branches: [main]` を持つ)。

手動ディスパッチは**成功する**:

```bash
gh workflow run "Project CI" -R kenken-trpg/daggerheart --ref main   # → success 27s
```

つまり Actions 自体は有効で、**フォークに対するイベントトリガーだけが
抑止されている**。`deploy.yml` は `on: release` のみなので手動起動もできない。

直すなら GitHub の Actions タブの
「I understand my workflows, go ahead and enable them」を1回押す。
押さない場合は下記のローカル手順で配れる (そのほうが確実)。

#### ローカルでリリース成果物を作る手順

`deploy.yml` と同じことを手元でやる:

```bash
npm run pullYMLtoLDBBuild
mv -f src/packs/LICENSE packs/LICENSE      # CI は GNU の --force。macOS は -f
npm run build

# deploy.yml と同じ置換: flags.hotReload を false にした system.json を作る
# (リポジトリの system.json は書き換えたままにしない)

zip -rq system.zip system.json README.md LICENSE \
    build/daggerheart.js build/tagify.css styles/daggerheart.css \
    assets/ templates/ packs/ lang/en.json lang/ja.json -x '*.DS_Store'

gh release upload <tag> -R kenken-trpg/daggerheart system.json system.zip
```

後片付け: `git checkout src/packs/LICENSE` と `system.json` の復元。

> **`zip -r lang/` と書いてはいけない。**
> `lang/DnD_Glossary_JP.txt` (953,549バイト) と `lang/Daggerheart_en-ja.csv` は
> `.gitignore` されているが**作業ツリーには存在する**ので、`zip` は拾う。
> `.gitignore` は `zip` に効かない。実際に1回目の zip に両方入っていた。
> **他者の著作物の再配布になる。** `lang/en.json lang/ja.json` と
> 個別に指定する。
>
> CI (`deploy.yml`) では新規チェックアウトなので起きない。
> **ローカルビルド固有の罠。**

#### B を選んだことで負う責任

- 上流がリリースするたびに、マージ → `lang:apply` → Release が必要。
  やらなければ古いままなので、**止めても壊れはしない**。
- 配布物のサポート窓口が自分になる。
- packs (980,122文字) は未訳のままなので、「枠は日本語・中身は英語」で配ることになる。
  これは Babele の有無とは別で、B でも A でも同じ。

## 日本語で崩れるレイアウト (CSS)

訳文そのものは正しくても、英語を前提にした CSS のせいで表示が崩れる箇所がある。
**原因は一つで、英語は単語の途中で改行できないが日本語は任意の文字間で改行できること。**
`display: flex` の子要素は既定で `min-content` まで縮むので、英語では
「単語1つぶんの幅」で下げ止まるところが、日本語では「1文字ぶんの幅」まで潰れて
縦書きのように積み上がる。

実機で検出して修正済み:

| 箇所 | 症状 | 修正 |
| --- | --- | --- |
| `styles/less/utils/mixin.less` の `.section-title()` | キャラクターシート左の「装備」「ロードアウト」「経験」が縦積み (ロードアウトは3行) | `h3` に `white-space: nowrap` |
| `styles/less/sheets/actors/adversary/sidebar.less` (攻撃/経験の2箇所) | 敵対者シートで同じ症状 | 同上 |
| `styles/less/sheets/actors/companion/details.less` | 相棒シートの「パートナー」が5行に分解 | 同上 |
| `styles/less/sheets/actors/companion/header.less` の `.status-label` | 相棒シートの「回避値」が2行になりバッジからはみ出す | `width: auto; min-width: 100%` + `h4` に `white-space: nowrap` |
| `styles/less/dialog/dice-roll/roll-selection.less` の `.dice-select .label` | ロールダイアログの「希望」「恐怖」が縦積み | `.label` に `white-space: nowrap` |
| `styles/less/dialog/item-transfer/sheet.less` の `label` | アイテム受け渡しダイアログの「数量」が2行 | `flex: 0` → `flex: 0 0 auto` |
| `styles/less/dialog/level-up/selections-container.less` の `.levelup-radio-choices label` | 相棒レベルアップ「獰猛」の「ダメージ」「射程」が縦積み (4行) | 同上 |

いずれも英語表示では描画幅が変わらないので、上流にそのまま PR できる性質の修正。

### 原因は2パターンある

- **flex アイテムの既定の縮み。** `min-content` まで縮むので、英語は単語幅、
  日本語は1文字幅で止まる。`white-space: nowrap` で対処。
- **`flex: 0` と書かれている箇所。** これは `flex: 0 1 0%` の略で、
  「伸びない」つもりでも **basis 0 + 縮み許可**なので日本語だと1文字まで潰れる。
  意図どおりにするなら `flex: 0 0 auto`。

後者は `grep -rn "flex: 0;" styles/less/` で7箇所あるが、**実害があるのは
日本語テキストを直接持つ2箇所だけ**だった。残り5箇所は中身がアイコンのみの
ボタン (`.end-button`)、子要素を並べるコンテナ (`.tags` / `.combatant-controls`)、
親が flex ではない箇所で、いずれも潰れない。
**`flex: 0` を見つけたら機械的に直すのではなく、そこに日本語の文字列が
直接入るかを先に確かめること。**

### 検出のしかた

目視では見落とすので、ブラウザのコンソールで DOM を走査する。
「葉ノードで、CJK を含み、描画幅がフォントサイズの 2.6 倍未満なのに 2行以上」を
崩れとみなす:

```js
[...document.querySelectorAll('.application *')].filter(el => {
    if (el.children.length) return false;
    const txt = el.textContent.trim();
    if (txt.length < 2 || !/[\u3040-\u30ff\u4e00-\u9fff]/.test(txt)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1) return false;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const lh = parseFloat(getComputedStyle(el).lineHeight) || fs * 1.2;
    return Math.round(r.height / lh) >= 2 && r.width < fs * 2.6;
});
```

アクター6種・アイテム12種のシートを順に開いて走査すれば、シート側は網羅できる。
**ダイアログは別途開かないと引っかからない** (上の「希望/恐怖」は
ロールダイアログを開くまで検出できなかった) ので、カバレッジは
「開いた画面のぶんだけ」である点に注意。

## 実機テストの手順

翻訳の抜けは `npm run lang:report` で分かるが、**レイアウトの崩れと
`.mjs` 直書きの英語は実際に動かさないと分からない。** 稼働中の Foundry
には触らず、独立したデータパスで立てる:

```sh
# 1. ビルド (packs を含む)
npm run build
npm run pullYMLtoLDBBuild

# 2. テスト専用のデータパスを用意してリポジトリをシンボリックリンク
TD=/tmp/fvtt-test
mkdir -p "$TD"/{Data/systems,Data/modules,Config}
cp "$HOME/Library/Application Support/FoundryVTT/Config/license.json" "$TD/Config/"
ln -sfn "$PWD" "$TD/Data/systems/daggerheart"
# core の日本語化は別モジュール任せなので、入れないと素の UI が英語のままになる
ln -sfn "$HOME/Library/Application Support/FoundryVTT/Data/modules/foundryVTTja" \
        "$TD/Data/modules/foundryVTTja"

# 3. 別ポートで起動 (本番の 30000 とデータパスの両方を避ける)
node "/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app/main.js" \
     --dataPath="$TD" --port=30100 --noupnp --headless --world=<world-id>
```

注意点:

- **既存のデータパスを使い回さない。** Foundry はデータパス単位でロックを取るので
  デスクトップアプリが動いていると起動できないし、`Data/systems/daggerheart` を
  差し替えると既存ワールドが次回起動時にマイグレーションされる。
- `foundryVTTja` を入れ忘れると `CHAT.MODES.public` などの **core のキー**が
  英語で出る。これはシステム側の不具合ではないので、未訳として数えないこと。
- `src/packs` の `_stats.coreVersion` は 14.366/14.367 を含む。
  それより古い core で起動すると journals と rolltables のマイグレーションが
  失敗する (`Documents from a core version newer than the running version
  cannot be migrated`)。`system.json` の verified に合わせた core を使う。

## 実機走査のカバレッジ

「崩れがない」と言えるのは**実際に開いた画面だけ**なので、どこまで見たかを残す。

| 画面 | レイアウト崩れ | 未訳 |
| --- | --- | --- |
| アクターシート 6種 (character / adversary / companion / party / environment / npc) | 修正済み (下記「日本語で崩れるレイアウト」参照) | なし |
| アイテムシート 12種 | なし | なし |
| ロールダイアログ (`D20RollDialog`) | 修正済み (希望/恐怖) | なし |
| チャットカード (デュアリティロール) | なし | なし |
| システム設定 5種 × 全タブ (自動化 / メタ情報 / ホームブリュー9タブ / 外観 / 選択ルール) | **なし** | `Image` 1件 |
| キャラクターレベルアップ 全3タブ (レベル成長 / 成長の選択 / 要約) | **なし** | なし。符号も全11箇所が全角＋ |
| レベルアップ選択肢ダイアログ (GM 側のティア編集) | なし | **17件** (`Tiers` / `Add Levelup Option` / 選択肢17種) |
| `CharacterResetDialog` / `DeathMove` / `Downtime` / `RiskItAll` / `CompendiumBrowserSettings` / `CountdownPermissions` / `ActiveEffectPathViewer` | なし | `Name` / `Submit` / `Save` |

2巡目で追加:

| 画面 | レイアウト崩れ | 未訳 |
| --- | --- | --- |
| キャラクター作成 全7タブ (クラス / 種族 / コミュニティ / 特性 / 経験 / 能力カード / 装備) | **なし** | コンペンディウム内容のみ (`Assassin` / `Katana` など。packs の課題) |
| `ItemTransferDialog` | **1件 → 修正済み** (数量) | なし |
| `GroupRollDialog` / `TagTeamDialog` / `ImageSelectDialog` / `DamageReductionDialog` / `MultiActionSelectionDialog` | なし | なし |
| `ItemBrowser` / `CountdownEdit` / `DhCountdowns` | なし | なし |
| 相棒レベルアップの「獰猛」選択肢 | **1件 → 修正済み** (ダメージ/射程) | なし |

未走査のまま残っているもの:
`BeastformDialog` (ビーストフォーム設定データが要る) /
`ResourceDiceDialog` と `ActionSelectionDialog` (リソースダイス付きアイテムが要る) /
`MulticlassChoiceDialog` / コンバットトラッカーの戦闘中表示 / 各種 HUD。

ダイアログによっては、ゲーム操作から実際の状態に到達するより
**実在の祖先クラス連鎖を組み立てて該当マークアップを差し込むほうが速い**。
相棒レベルアップの「獰猛」はこの方法で確認した。ただし
**コンテナに生テキストを入れると実際には起きない崩れを誤検出する**
(`.tags` がこれで誤検出だった) ので、本来そこに入る要素の形を再現すること。

補足:

- `Submit` / `Save` は Foundry core の既定ボタンラベル。システム側ではなく
  `foundryVTTja` の守備範囲。
- コンペンディウムブラウザ設定に出る `Classes` / `Subclasses` / `Domains` …は
  `system.json` の `packs[].label`。Foundry は `CompendiumCollection#title` を
  `metadata.label` のまま返すだけで localize しない (dnd5e も同様に英語のまま)。
  **これは packs 翻訳の課題**であって UI 翻訳の抜けではない。Babele は
  コンペンディウム名も訳せるので、上記「packs の翻訳方式」でまとめて解決する。

## 翻訳機構を通っていない文字列 (上流の不具合)

`ja.json` では直せないもの。**どれも en.json にキーを足す上流 PR が必要。**

`.hbs` 側は2種類ある。

生の英語がそのまま書かれているもの:

| 箇所 | 文字列 | 備考 |
| --- | --- | --- |
| `templates/dialogs/reactionRoll.hbs:2` | `Reaction Roll` | 上流に PR を出す価値がある (en.json にキーを追加してテンプレートを差し替えるだけ) |
| `templates/sheets/actors/party/projects.hbs:3` | `Soon tm` | 未実装機能のプレースホルダ。放置で可 |

**`{{localize}}` は通っているが、渡しているキーが存在しないもの。**
Foundry は未知のキーを渡されるとキー文字列自体を返すので、英語がそのまま出る。
「`{{localize}}` の有無」で検索すると見落とすので注意:

| 箇所 | 渡しているキー | 画面上の出方 |
| --- | --- | --- |
| `templates/dialogs/levelupOptionsDialog/header.hbs:2` | `"Tiers"` | クラス/サブクラスの「レベルアップ選択肢」ダイアログの見出し |
| `templates/dialogs/levelupOptionsDialog/parts/tier.hbs:6` | `"Add Levelup Option"` | 同ダイアログのボタン |

この2件は ja.json のルートに同名キーを置けば一応は訳せるが、**`lang:apply` が
en.json を基準に ja.json を組み直す際に落とされる** (`tools/lang-sync.mjs` の
「en.json にないキーは retired として捨てる」挙動)。その場しのぎにしかならないので
採用していない。

**`.mjs` 側はテンプレートより多い。** データモデルの `initial` 値や設定テーブルに
英語がそのまま書かれている箇所があり、こちらは画面に出るにもかかわらず
`ja.json` では一切手が出せない。実機テストで見つかった代表例:

| 箇所 | 文字列 | 画面上の出方 |
| --- | --- | --- |
| `module/data/actor/companion.mjs:86` | `name: 'Attack'` | 相棒シートの既定攻撃の名前。character は `_loc('DAGGERHEART.GENERAL.unarmedAttack')` を使っているので対応漏れ |
| `module/data/actor/adversary.mjs:74` | `name: 'Attack'` | 同上 (敵対者シート) |
| `module/data/item/weapon.mjs:55` | `name: 'Attack'` | 同上 (武器) |
| `module/data/levelTier.mjs:146-194` | `Character Trait` / `Hit Points` / `Evasion` / `Proficiency` / `Experience` / `Domain Card` / `Subclass` / `Multiclass` / `Increase Dice Size` ほか | レベルアップ選択肢 (`LevelOptionType`)。`levelupOptionsDialog.mjs` と `companionLevelup.mjs` が `.label` をそのまま表示する |
| `module/config/actorConfig.mjs:281-326` | `Armor Marks +1` / `Major Damage Threshold +2` など | レベルアップのティア選択肢 |
| `module/data/fields/action/rollField.mjs:91,155` | `Bonus to Hit` / `Attack` | アクション設定 |
| `module/data/activeEffect/baseEffect.mjs:160` | `New Effect` | 効果の新規作成時の名前 |
| `module/data/settings/Homebrew.mjs:145` | `label: 'Image'` | ホームブリュー設定 → ドメイン タブ。隣の `label` フィールドは `DAGGERHEART.GENERAL.label` を使っており、**`DAGGERHEART.GENERAL.imagePath` が既に存在する**ので1語差し替えるだけで直る |
| `module/applications/dialogs/characterResetDialog.mjs:17` | `label: 'Name'` | キャラクターリセットの確認ダイアログ |

一括検出は下記で出せる (内部 ID と混ざるので目視選別が要る):

```sh
grep -rnE "\b(name|label|title|hint|placeholder): '[A-Z][^']+'" module/
```

直すなら `en.json` にキーを足して `_loc()` 経由にする上流 PR になる。
フォーク側だけで潰すことはできない。

## 参照している原典・訳文

| 名称 | 版 | URL |
| --- | --- | --- |
| Daggerheart System Reference Document 2.0 | DH_SRD_2_2026_08_25 | https://www.daggerheart.com/wp-content/uploads/2026/08/DH_SRD_2_2026_08_25.pdf |
| ダガーハート SRD 日本語版（非公式・しろぱんだ訳） | 宣伝前ベータ版 | https://shirokuro-hanten.github.io/dhsrd-jp/ |

### 参照のみ・取り込み不可

| ファイル | 理由 |
| --- | --- |
| `lang/DnD_Glossary_JP.txt` | 他者の編纂物（D&D 日本語版の公式訳語に出典ページを付した一覧）。手元で参照するのは自由だが、本リポジトリに取り込んで再配布することはできない。`.gitignore` 済み。 |
| `lang/Daggerheart_en-ja.csv` | 上記由来の D&D 列を含むため、このファイル自体は取り込まない。D&D 列を除いた `glossary/daggerheart-ja.csv` が取り込み済みの正本。`.gitignore` 済み。 |

D&D の定訳語を訳の参考にすること自体は差し支えないが、**出典付きの対訳表という形で
リポジトリに持ち込まない**。「有利」「クラス」級の短い定訳語が結果的に一致するのは問題ない。

## 上流のライセンス構造

README.md（Licenses 節）より:

- SRD 記載のゲーム内容およびドメインアイコン → [Darrington Press Community Gaming License](https://darringtonpress.com/wp-content/uploads/2025/07/DPCGL-July-30th-2025.pdf)
- HTML / CSS / JavaScript → MIT

`lang/*.json` はデータファイルだが、防具・武器特徴のルール文など SRD 由来の文章を含む。
その和訳は SRD テキストの二次的著作物であり、配布の根拠は DPCGL の許諾範囲に依存する。
これは `ja.json` を置いている時点で既に同じ枠内にあり、用語集 CSV で新たに生じる論点ではない。

## しろぱんだ訳の取り込みについて

**現状: 未取り込み。** 受け入れ側の仕組み (`glossary/`、`lang-sync.mjs` の
`diff` による既訳との差分採否) だけを用意した段階。

取り込む場合に先に片付けること:

- **許諾**: 非公式のファン訳。訳者 (しろぱんだ / shirokuro-hanten) に、本リポジトリへの
  転載と再配布 (MIT ライセンス下の Foundry システムとして) の可否を確認する。
  クレジット表記の要否・形式もあわせて確認する。
  サイトのフッタには「訳文はセッション、配信、二次創作物などに利用してよい」旨の
  記載があるが、**想定用途がそれらに限られており、ソフトウェアに同梱しての
  再配布は読み取れない。この記載を許諾の代わりにしない。**
- **版の固定**: 「宣伝前ベータ版」であり今後変動する。取り込む際は参照日と版を
  このファイルに記録し、あとから差分を追えるようにする。
- **粒度の差**: SRD の本文訳であり、`en.json` の UI 文言とは 1対1 対応しない。
  本文と一致する能力名・特徴名・ルール用語を用語集 CSV に起こす形で取り込み、
  UI 固有の文言は既存の訳を維持する。命中はゲーム内容の名称 (packs) に偏るので、
  「外部の対訳資料から用語集 CSV を起こす」の節に従って投入先を分ける。
- **未整備の範囲**: サイト自身が一部の章 (SRD1.0 のティア2以降、SRD2.0 の
  敵キャラクター・環境・キャンペーン設定) を未整備と明記している。
  取り込み時点で埋まっている範囲を記録しておく。
- **既存訳との衝突**: 現行 `ja.json` には既に独自訳が入っている
  (鎧スロット / ストレス / 希望 / 恐怖 / 回避値 / ダメージしきい値 /
  近接射程・至近・近距離・遠距離 / 呪文発動 / 能力カード / 保管庫 など)。
  用語を切り替える場合は一括置換ではなく、用語ごとに採否を決める。

取り込みを始めるときの手順:

1. 訳者の許諾を得る。
2. 「外部の対訳資料から用語集 CSV を起こす」の節に従って抽出する。
   この出典は**対訳併記型** (見出しに原語が併記されている) なので、原典との
   対応付けは不要で、抽出のみで CSV が起こせる。
3. 上の表に出典・版・参照日・許諾の状況を追記する。
4. `node tools/lang-sync.mjs diff --only=shiropanda` → 用語ごとに採否を決める → `apply`。
   未訳キーがある場合は `prepare` も併用する。

## 再撤回: A (翻訳モジュール) へ移る (2026-10-04)

`id` を `daggerheart-ja` に変えた判断 (上節) をさらに覆し、**B を捨てて A
(翻訳モジュール) に移る**。方式そのものの評価は上の「選択肢」の表から変えない。
変わったのは決定要因で、**本家の mod が使えるかどうか**が加わった。

### 決定要因: `id` を変えた時点で本家 mod が使えなくなっていた

Foundry の mod は次の5点でシステム `id` に依存する。`daggerheart-ja` ではすべて外れる。

1. **マニフェストのシステム制限。** 公式ドキュメント (Module Development) は
   「`"system": ["dnd5e"]` を指定すると、そのゲームシステムで動いている
   ワールドでしか有効化できない」と書いている (v10 以降は
   `relationships.systems` に統合)。`daggerheart` を宣言した mod は
   `daggerheart-ja` では**有効化すらできない**。
   *確度: ドキュメントで確認。サーバ実装は手元に無く未確認。*
2. `game.system.id === 'daggerheart'` のコード判定。
3. `systems/daggerheart/...` のパス参照 → 404。
4. `Compendium.daggerheart.*` の UUID 参照 → 解決不能。
5. `flags.daggerheart` の読み書き。フォークは一部を `daggerheart-ja` に改名済み
   (`38d01473`)。

1 はサーバ側で効くので、システム側のコードからは回避できない。mod ごとに
`module.json` を書き換える運用は、mod の更新ごとに再発する。

### B の前提だった「開発しない」はすでに崩れている

A を退けた理由は「新しいリポジトリ、`module.json`、`lang/` と `tools/` の移設、
CSS のレイヤ上書き、Babele の配線 ＝ 作業が増える」だった。その後 B のために
実際に払ったのは次のとおりで、A の見積もりを上回る。

- `id` 改名: 1,415 パス + 882 UUID + `packs[].system` 15件 (`a0173fef`)
- 取りこぼしたフラグ・設定スコープの改名 (`38d01473`、実機で発覚)
- リリースワークフローがフォークでは走らない → ローカル手順の整備 (`55f3c7bb`)
- 以後、上流リリースごとに同じ改名をマージし続ける固定費

### 移る先の中身は「翻訳 + CSS 10宣言」しかない (実測)

上流 (`36bfd833`) との差分 842 ファイルから `id` 改名分を除くと、残るのは下表だけ。
**`module/` と `templates/` の実質的変更はゼロ** (全て `id` 改名)。

| 中身 | 規模 | 移設先 |
| --- | --- | --- |
| `lang/ja.json` | 2,285 キー (未訳 0) | モジュールの `languages[]` |
| CSS 修正 | **10 宣言** | モジュールの `styles[]` |
| `lang/translation/`, `tools/lang-sync.mjs` | 翻訳作業用。配布物ではない | そのまま移設 |
| `packs/` | 未翻訳 | Babele (上の設計節のまま) |

### CSS は 10 宣言。セレクタは実測で確定した

LESS の差分 (7ファイル) を手でセレクタに起こす必要はない。**上流と現在の
両方をビルドして、コンパイル後の CSS を差分する**と完全なセレクタ鎖が得られる。

```bash
npm run gulp && cp styles/daggerheart.css /tmp/fork.css
git worktree add /tmp/base 36bfd833 && ln -s "$PWD/node_modules" /tmp/base/
(cd /tmp/base && npx gulp less && cp styles/daggerheart.css /tmp/base.css)
diff <(sed 's/}/}\n/g' /tmp/base.css) <(sed 's/}/}\n/g' /tmp/fork.css)
```

実行結果は 10 宣言。セレクタは**すべて `daggerheart` / `dh-style` の CSS
クラス**を使っており、`a0173fef` がクラス名を意図的に改名しなかったおかげで
**公式システムにそのまま当たる**。

| セレクタ | 宣言 |
| --- | --- |
| `.application.sheet.daggerheart.actor.dh-style.adversary .adversary-sidebar-sheet .attack-section .title h3` | `white-space: nowrap` |
| `… .adversary .adversary-sidebar-sheet .experience-section .title h3` | `white-space: nowrap` |
| `.application.sheet.dh-style .character-sidebar-sheet .experience-section .title h3` | `white-space: nowrap` |
| `… .companion .tab.details.active .experience-list .title h3` | `white-space: nowrap` |
| `… .companion .companion-header-sheet .status-section .status-number .status-label` | `width: auto` / `min-width: 100%` |
| `… .status-label h4` | `white-space: nowrap` |
| `.application.daggerheart.dialog.dh-style.views.roll-selection … .dice-select .label` | `white-space: nowrap` |
| `.daggerheart.levelup .levelup-selections-container .levelup-radio-choices label` | `flex: 0 0 auto` |
| `.daggerheart.dh-style.dialog.item-transfer label` | `flex: 0 0 auto` |

`modules` カスケードレイヤが `system` より後なので、詳細度を気にせず当たる
(上の「モジュールの CSS はシステムの CSS に勝つ」節で検証済み)。

### 工程

**工程1. リポジトリを起こす。** 新規 `kenken-trpg/daggerheart-ja` を推す。
フォーク (`kenken-trpg/daggerheart`) は上流履歴を持つシステムであり、そこに
モジュールのマニフェストを同居させると配布物の筋が二重になる。既存リリースは
残したまま非推奨にする。
*代替: 同一リポジトリの別ブランチに置き、`raw.githubusercontent.com/<repo>/<branch>/module.json`
を配る。リポジトリは増えないが、`deploy.yml` が2系統になる。*

**工程2. `module.json` を書く。** 確定している形:

```json
{
  "id": "daggerheart-ja",
  "languages": [
    { "lang": "ja", "name": "日本語", "path": "lang/ja.json", "system": "daggerheart" }
  ],
  "styles": ["styles/daggerheart-ja.css"],
  "relationships": {
    "systems": [{ "id": "daggerheart", "type": "system",
                  "compatibility": { "minimum": "2.10.7", "verified": "2.10.9" } }],
    "recommends": [{ "id": "babele", "type": "module", "reason": "packs 訳" },
                   { "id": "foundryVTTja", "type": "module", "reason": "コア UI の日本語化" }]
  }
}
```

`languages[].system` による上書きは v14.365 の `localization.mjs` で検証済み
(上節)。上流の `languages` は `en` のみなので、現時点では衝突もしない。

**工程3. `lang/ja.json` と CSS を移す。** CSS は上表の 10 宣言を手書きの
`styles/daggerheart-ja.css` として起こす。LESS のビルドは持ち込まない
(10 宣言に gulp/less は不要)。

**工程4. `tools/lang-sync.mjs` の参照元を外部化する。** これが唯一の新規実装。
現在 `lang/en.json` を同じリポジトリ内の実ファイルとして読んでいる
(`report` / `prepare` / `apply` すべて) が、モジュール側には存在しない。
上流の `lang/en.json` をタグ固定で取得して `lang/.reference/en.json`
(gitignore) に置く `tools/fetch-reference.mjs` を足し、`LANG` の参照を分ける。
これで上流追従は「参照を引き直して `lang:report` → `prepare` → `apply`」だけになり、
**マージ競合がゼロになる** (A の決め手)。

**工程5. 実機確認。** 公式システム 2.10.9 + 本モジュールで、既存の
「実機テストの手順」「実機走査のカバレッジ」節をそのまま流す。
あわせて**本家 mod が1つ有効化できることを確認する** (今回の移行理由なので)。

**工程6. 配布。** `module.json` / `module.zip` を Release に添付する
ワークフロー。`deploy.yml` を流用するが、packs ビルド (`pullYMLtoLDBBuild`) と
`rollup` は不要になり、zip の中身は `module.json` / `lang/` / `styles/` /
`LICENSE` / `README.md` だけになる。フォークで Release イベントが走らなかった
問題 (`55f3c7bb`) は新規リポジトリでは発生しないが、初回は要確認。

**工程7. packs 訳 (Babele)。** 上の「設計」節で決着済みの内容を、そのまま
このモジュールの `babele/` に実装する。`Babele.get().register({ module, lang, dir })`
で登録する (dnd5e-de の実装で確認)。工程6 までと独立なので後回しでよい。

### 移行で壊れるもの

- **`daggerheart-ja` のワールドは開けなくなる。** システムが無くなるため。
  ワールドの `world.json` の `system` を `daggerheart-ja` → `daggerheart` に
  書き換えれば開く。`id` 改名のときと逆向きの同じ作業。
- **公開済みのインストール URL (2026-10-03) は非推奨になる。** 入れた人に
  移行先を案内する必要がある。README に移行手順を書く。
- **`.mjs` 内のハードコード文字列は直せなくなる** (「翻訳機構を通っていない
  文字列」節)。上流の AI Policy で PR も出せないので、**訳せないまま残る**。
  これは A を選ぶ代償として受け入れる。
- **CSS が静かに効かなくなりうる。** 上流がセレクタを変えてもエラーは出ない。
  上の `diff` 手順を上流追従時に回して検出する。
