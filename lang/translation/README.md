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

## モジュール版の実機確認 (2026-10-04・済)

公式システム **2.10.9** + 本モジュール + 本家 mod 2本を、専用データパス
(core 14.365、ポート 30100) で起動して確認した。

| 確認項目 | 結果 |
| --- | --- |
| モジュールが認識される | 0.1.0、`unavailable: false` |
| `languages[].system` で公式システムの訳を上書きできる | **成立**。`回避値` `恐怖` 等が公式システム上で日本語になる |
| CSS が `modules` レイヤに入る | `@import url("modules/daggerheart-ja/styles/daggerheart-ja.css") layer(modules)` |
| CSS がシステムに勝つ | `flex: 0` → 計算値 `flex-basis: auto`、`white-space: nowrap` |
| **本家 mod が有効化できる** | `daggerheart-fear-tracker` 1.2.5、`daggerheart-distances` 0.2.7。**両方 active、`unavailable: false`**。どちらも `relationships.systems: [{id: "daggerheart"}]` を宣言している |
| コンソールエラー | なし |

**これが移行の目的そのものの確認。** 同じ mod は `daggerheart-ja` システムでは
宣言したシステムが合わず有効化できない。

### 実機走査で CSS の漏れが4か所見つかった

フォーク時代の CSS 修正は**不完全だった**。コンパイル後 CSS の差分から機械的に
移した10宣言では、下の4か所が直っていなかった。フォークでも同じく崩れていた
はずで、移行で持ち込んだ不具合ではない。

| シート | 見出し | 状態 |
| --- | --- | --- |
| 伴獣 | パートナー | 5行に縦積み (高さ 100px) |
| 伴獣 | 攻撃 | 2行に縦積み (高さ 40px) |
| キャラクター | 装備 | 2行に縦積み |
| キャラクター | ロードアウト | 3行に縦積み |

同じ伴獣シートの「経験」だけが直っていた。**フォーク時代の修正は目視で、
見つけたものだけを直していた**ことがここで分かる。

### 走査は目視ではなくスクリプトで回す

上の4か所は、崩れを機械的に検出して見つけた。判定は「葉要素・日本語を含む・
20文字以内・2行以上・幅が文字数に対して不足」。これをアクタ6種とアイテム12種、
および画面全体に当てた。

```js
// ブラウザのコンソールで実行する
window.__scan = function (root) {
    const bad = [];
    root.querySelectorAll('*').forEach(el => {
        if (el.children.length) return;            // 葉要素だけ
        const t = el.textContent.trim();
        if (!t || t.length > 20) return;
        if (!/[ぁ-んァ-ン一-龥]/.test(t)) return;   // 日本語を含むものだけ
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (!r.height) return;
        const lines = Math.round(r.height / (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2));
        if (lines >= 2 && r.width < t.length * parseFloat(cs.fontSize) * 0.9)
            bad.push({ text: t, lines, w: Math.round(r.width), ws: cs.whiteSpace });
    });
    return bad;
};

for (const type of ['character', 'companion', 'adversary', 'npc', 'environment', 'party']) {
    const a = await Actor.create({ name: '走査_' + type, type }, { renderSheet: false });
    await a.sheet.render(true);
    await new Promise(r => setTimeout(r, 1200));
    console.log(type, window.__scan(a.sheet.element));
    await a.sheet.close();
    await a.delete();
}
```

**上流を追従するたびにこれを回す。** モジュールの CSS は上流がセレクタを
変えると静かに効かなくなるので、崩れていないことを毎回確かめる必要がある。

修正後の再走査では、アクタ6種・アイテム12種・画面全体のいずれも検出ゼロ。

### ダイアログ3種も走査した (2026-10-04・済)

残していたダイアログを開いて走査した。**いずれも崩れなし。**

| ダイアログ | 出しかた | 結果 |
| --- | --- | --- |
| ダイスロール選択 (`d20RollDialog`) | キャラクターシートの特性をクリック | 崩れなし。`希望` `恐怖` のラベルが `nowrap` で1行 |
| アイテム譲渡 (`ItemTransferDialog`) | `new ItemTransferDialog({originActor, targetActor, max: 5, initial: 1})` | 崩れなし。`数量` ラベルの計算値が `flex-basis: auto` |
| レベルアップ (キャラクター) | 下記 | 成長・選択・要約の3タブとも崩れなし |
| レベルアップ (伴獣) | 下記 | 崩れなし。`.levelup-radio-choices` の `ダメージ` `射程` が `flex-basis: auto` |

CSS 修正の `flex: 0 0 auto` 2件は、これで**実際に当たっている要素の上で確認できた**。

#### レベルアップダイアログの出しかた

素のアクタでは開かない。`nrSelections` で落ちる。

```js
// キャラクター: クラスとサブクラスを持たせ、changed > current にする
const pc = await Actor.create({ name: '走査_pc', type: 'character' });
const cls = (await game.packs.get('daggerheart.classes').getDocuments()).find(d => d.type === 'class');
const sub = (await game.packs.get('daggerheart.subclasses').getDocuments()).find(d => d.type === 'subclass');
await pc.createEmbeddedDocuments('Item', [cls.toObject(), sub.toObject()]);
await pc.update({ 'system.levelData.level.changed': 2 });
await new game.system.api.applications.levelup.CharacterLevelup(pc).render({ force: true });
```

**伴獣のレベルは相棒から導出される。** `levelData.level.changed` を直接書いても
`prepareData` が `this.partner.system.levelData.level.current` で上書きするので、
**相棒の `current` を上げてから相棒を結ぶ**。

```js
const comp = await Actor.create({ name: '走査_伴獣', type: 'companion' });
await pc.update({ 'system.levelData.level.current': 3, 'system.levelData.level.changed': 3 });
await comp.update({ 'system.partner': pc.uuid });   // これで comp の changed が 3 になる
await new game.system.api.applications.levelup.CompanionLevelup(game.actors.get(comp.id)).render({ force: true });
```

`.levelup-radio-choices` は**伴獣のレベルアップにしか出ない**。
`selections.hbs` で `vicious` (ダメージダイス/射程の強化) のときだけ描画されるため、
「相棒のダメージダイスまたはお得意を1段階上げます」を選んでから「成長の選択」タブへ移る。

要約タブは最終レベルに達するまで出ない。「要約へ」ボタンから進む。

### 翻訳機構を通っていない文字列: 実例が1つ見つかった

伴獣のレベルアップの見出し **`Companion Choices` が英語のまま**出る。

```js
// build/daggerheart.js:14434
const defaultCompanionTier = {
    tiers: { 2: { tier: 2, name: 'Companion Choices', ... } }
};
```

`game.i18n` を通っていないただの文字列リテラルで、`ja.json` に足しても効かない。
`CONFIG.DH` と `game.system.api` の両方を再帰的に探したが**到達できない**
(モジュール内の const)。つまり**モジュールからは直せない**。

これが「A を選ぶ代償」の具体例。上流の AI Policy で PR も出せないので、
**英語のまま残す**。`renderApplication` フックで DOM の文字列を置換することは
技術的には可能だが、英文のマッチに頼るので上流が変えると静かに壊れる。やらない。

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

### 工程0〜1 実装済み・実機で成立を確認 (2026-10-04)

**方式は成立する。** `transformations` で端から端まで通した。

| 確認項目 | 結果 |
| --- | --- |
| 訳ファイルが読まれる | `translation for daggerheart.transformations pack successfully loaded from modules/daggerheart-ja/babele/ja/…` |
| `_id` 照合 | 成立。`_identity: {export:["_id"], match:["_id","name"]}` |
| 既定マッピングの上書き | 成立。`description` を `system.description.value` → `system.description` に差し替え |
| `structured` コンバータ | 成立。`system.actions.<id>.name` / `.description` が訳される |
| **訳さないデータの保全** | 成立。action の残り18キー (`type`/`damage`/`_id` 等) は無傷 |
| フォルダ名 | 成立。`変身の特徴` |
| 未訳エントリ | 英語のまま残る |
| コンソール | 警告・エラーなし |

実装は次の4つ:

| ファイル | 役目 |
| --- | --- |
| `tools/fetch-reference.mjs` | 上流の tarball から `lang/en.json` と `src/packs/**` を取得 (1,822ファイル) |
| `tools/packs-sync.mjs` | `export` / `prepare` / `apply` / `report` / `check` |
| `babele/ja/mappings.json` | `_identity` とフィールドマッピング |
| `scripts/babele.mjs` | `game.babele.register({module, lang, dir})` |

#### 実機で分かったこと (設計時に見落としていた3点)

**1. Babele は libWrapper を必須とする。** `script/foundry/wrapper.js` が
`CONFIG.DatabaseBackend._getDocuments` を libWrapper で包んで訳を当てる。
libWrapper が無いと**登録もファイル読み込みも成功したまま、訳だけが当たらない**。
Babele の `module.json` には `relationships.requires` に入っているので
インストール時には解決されるが、切っていると静かに失敗する。
`game.babele.translate(collection, data)` を直接呼ぶと訳が返るので、
**「translate は効くのに画面は英語」ならまず libWrapper を疑う**。

**2. 未訳フィールドを `""` で書いてはいけない。** Babele はファイルにある値を
そのまま当てるので、`"name": ""` と書くと**原文が消えて名前が空のエントリになる**。
実機で `Corpse` の名前と説明が消えて発覚した。
→ `export` は**訳のあるフィールドだけを書く**。未訳の受け皿は `lang-sync` と同じく
別の作業ファイル (`prepare` → `lang/translation/packs-pending.json` → `apply`)。

**3. フォルダはドキュメントではない。** `src/packs/**` にはフォルダ定義の JSON
(`_key` が `!folders!…`) が混ざっている。これをエントリとして書くと、
コンペンディウムに存在しない `_id` を持つ行ができる (19件書いて実在18件)。
Babele はフォルダを**英語名をキーに** `folders` で引く。`entries` とは別物。

```json
{
    "collection": "daggerheart.transformations",
    "folders": { "Transformation Features": "変身の特徴" },
    "entries": {
        "ohtlJOWsGtPumnt3": { "_note": "Fangs", "name": "牙", "description": "<p>…</p>" }
    }
}
```

**4. `Babele.get()` は非推奨。** 2.5.5 以降は `game.babele`、4 で削除予定。
既存の翻訳モジュール (dnd5e-de 等) の例はこの古い API を使っているので、
真似すると警告が出る。

#### 運用

```bash
npm run reference            # 上流の en.json と src/packs を取得
npm run packs:export         # 訳ファイルを上流に合わせて作り直す (訳は保持)
npm run packs:prepare        # 未訳を packs-pending.json に書き出す
#   → "ja" を埋める
npm run packs:apply
npm run packs:report         # パック別カバー率
npm run packs:check          # エンリッチャ (@UUID/@Lookup) の整合性
```

`packs-sync.mjs` の `ENABLED` に書いたパックだけを対象にする。いまは
`transformations` のみ。**1パックずつ、実機で確認してから広げる** —
パックごとにデータ形状が違い、マッピングの追加が要るため。

#### 次に広げるときに要るマッピング

`transformations` は `name` / `system.description` / `system.actions` しか持たない、
最も単純な形。上の「必要なマッピングの全体像」の表のうち、まだ書いていないのは
`items[]` (`document` コンバータ)、`effects[]`、`system.motivesAndTactics`、
`system.attack.name`、`system.experiences`、`pages[].text.content`。
工程2 (`communities` + `ancestries`) が `items[]` の検証になる。

### 工程2 (`communities` + `ancestries`) 済み — 計画の前提が1つ外れていた

**`items[]` はこの2パックに存在しない。** 工程表には「工程2で入れ子 `items[]` を
検証する」と書いていたが、実データを見ると `communities` / `ancestries` の
`features` は**同じパック内の別ドキュメントへの UUID 参照**で、埋め込みではない。

```json
"system": { "features": ["Compendium.daggerheart.communities.Item.OyzEkHdHYwmoofQx"] }
```

参照先は同じパックのエントリなので、**既存のマッピングでそのまま訳せる**
(`ancestries` 73ファイルの内訳は ancestry 24 + feature 48 + フォルダ1)。
`items[]` の検証は、アクターに機能が埋め込まれている `adversaries` /
`environments` (工程5) まで出番がない。

代わりにここで検証できたのは **`effects[]`**:

| 確認項目 | 結果 |
| --- | --- |
| `effects[]` の `name` / `description` | 成立 (Babele の既定マッピングがそのまま効く) |
| エフェクトの他18キー | 無傷 |
| 3パック同時読み込み | エラーなし |
| 未訳エントリ | 英語のまま、名前の欠落なし (30/30、72/72) |

#### マッピングのレイヤはキー単位でマージされる (検証済み)

`document-mappings.js` の `#mergeLayer` は型ごとに
`#mergedDefinition(target[key] ?? {}, value)` を呼ぶ。つまり
**`Item` を定義しても既定の `effects` は消えない。** `description` だけを
`system.description.value` → `system.description` に差し替えられるのはこのため。

裏を返すと、**既定を無効化したいときは明示的に打ち消す必要がある**。
これは `ActiveEffect.changes` で効いてくる: 既定は `changes[].value` を
`structured` で訳す設定になっているが、ここには数式が混ざる
(「訳してはいけないフィールド」参照)。`communities` / `ancestries` には
`changes` が1件も無いので今回は無害だったが、**`changes` を持つパックを
有効にするときは、その前に打ち消し方を決めること。**

#### 訳さないと判断したフィールド (実データで確認)

| フィールド | 実際の値 | 判断 |
| --- | --- | --- |
| `system.featureForm` | 63件すべて `passive` | 列挙キー。訳さない |
| `system.loreReference` | `warborne` / `frostborne` など小文字スラグ | 同上 |
| `system.features` | `Compendium....Item.<id>` | 参照。訳すと壊れる |

### 工程5の下ごしらえ済み — `adversaries` / `environments` の機構を全部通した (翻訳はまだ)

5パック有効 (`transformations` / `communities` / `ancestries` / `adversaries` /
`environments`)。機構を1つずつ踏むプローブ訳だけを入れて実機確認した。

| 機構 | マッピング | 結果 |
| --- | --- | --- |
| **埋め込み `items[]`** (912+197件) | `document` / `Item` / many | 成立。アイテム名・説明・`actions`・`effects` まで再帰 |
| `system.attack` | `structured` / `cardinality: one` | 成立。他21キー無傷 |
| `system.experiences.<id>` | `structured` / `keyed` | 成立 |
| `system.motivesAndTactics` / `impulses` / `notes` | 既定 | 成立 |
| `system.potentialAdversaries.<id>.label` | `structured` / `keyed` | 成立。参照 UUID 3件は無傷 |
| **`effects[].system.changes[]`** | `structured` / `array` | 成立。位置指定で当たる |
| 数式 29件 | — | 1件も訳されていない |
| 名前の欠落 | — | 0件 (431/431) |
| レイアウト崩れ | — | 0件 (実データの日本語で再走査) |

#### `changes` のパスが違っていた — 既定マッピングは最初から空振りしていた

設計では「Babele 既定の `ActiveEffect.changes` が数式を訳してしまう」ことを
リスクとしていたが、**このシステムに `effects[].changes` は1件も存在しない**。
実際のパスは **`effects[].system.changes[]`**。既定は空振りするだけで無害だった。

#### 訳すべき change は2キーだけ (全パック走査で確定)

`system.changes[].value` を全パックで集計し、キー別に自由文の有無を数えた:

| キー | 件数 | 自由文 |
| --- | --- | --- |
| `system.advantageSources` | 43 | **43** |
| `system.disadvantageSources` | 23 | **23** |
| `system.evasion` | 85 | 0 |
| `system.bonuses.damage.bonus` | 63 | 0 |
| `system.damageThresholds.*` | 76 | 0 |
| その他50キー | — | 0 |

**この2キー以外はすべて数値・ダイス式・ロール式。** 残りの値は
`1 + @system.tier` / `ceil(@system.traits.agility.value / 2)` / `d10` / `2` など。

→ **許可リストにした** (`TRANSLATABLE_CHANGE_KEYS`)。設計にあった
「`@` を含む値を数式として弾く」ヒューリスティックは**不採用**。
`d10` や `2` を通してしまうので、キーで決めるほうが安全で検証もできる。

#### `changes` は位置で照合する

1つのエフェクト内に同じキーの change が複数ある例が5件ある
(`Steady` の advantageSources は3件)。キー照合では潰れる。
`structured-data-converter.js` の `_entries` / `_translations` を読むと、
`container: "array"` のときは **translation が配列なら添字で対応付ける**。
そこで訳ファイルは**元配列と同じ長さの配列**にし、訳さない位置は `null` を置く。
`null` の位置は `_translateValue` が原文をそのまま返す。

```json
"effects": { "wGuxOLokMqdxVSOo": { "changes": ["敏捷ロール"] } }
```

#### 訳さないと判断したフィールド (追加分・実データで確認)

| フィールド | 実際の値 |
| --- | --- |
| `system.type` (敵役) | `solo` / `horde` / `skulk` / `minion` ほか10種の列挙 |
| `system.size` | `tiny` 〜 `gargantuan` の6種 |
| `potentialAdversaries.<id>.adversaries` | `Compendium.daggerheart.adversaries.Actor.<id>` の配列 |

#### `check` が実際に取りこぼしを捕まえた

プローブ訳で `@Template[type:inFront|range:c]` を落としたまま書いたところ、
`packs:check` が原文と訳文のエンリッチャ不一致として報告した。
**この検査は飾りではない。** `@Lookup[@name]` は敵役の説明文に多数あり、
落とすと名前が出なくなる。

#### `carryOver` のバグ — 入れ子を2段と決め打ちしていた

`export` が訳を引き継ぐ処理が、コンテナを「2段の入れ子」と決め打ちしていた。
`experiences.<id>.name` のような2段では正しく動くが、**1段の `attack.name` では
文字列 "Claws" を1文字ずつ走査し、`{"0": "爪"}` を書き出していた。**
Babele から見ると `name` が文字列でないので黙って無視され、
**実機で「attack だけ訳が当たらない」という形で出た。**
原文の形に従って任意の深さで再帰するように書き直した。

### 残っている未検証項目

- **既存ワールドへの影響。** Babele は閲覧・インポート時にのみ訳を当てる。
  既にワールドへインポート済みのドキュメントは遡って翻訳されない。
  ユーザーへの告知事項。**未検証。**
- **モジュール配布物に `babele/` を含めること。** リリースの zip は
  `module.json` / `lang/` / `styles/` だけだったので、`babele/` と `scripts/` の
  追加が要る (`.github/workflows/release.yml`)。
- **`recommends` に lib-wrapper を足すか。** Babele 自身が `requires` で
  持っているので二重になるが、上の「静かに失敗する」経路を踏ませないために
  書いておく価値はある。判断保留。

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

## 残り10パックのマッピングを全部通した — 「既存マッピングで足りる」は外れだった (2026-10-05)

工程5の報告で「残るパックは既存マッピングで足りる見込み」と書いた。測って
いなかった。全パックの文字列リーフを現行マッピングと突き合わせたところ、
**届いていない自由文が12経路 876フィールド**あった。

| 件数 | 経路 | パック |
| --- | --- | --- |
| 324 | `system.attack.name` | weapons |
| 240 | `results[].name` | rolltables |
| 64 | `system.advantageOn.<id>.value` | beastforms |
| 56 | `system.actions.<id>.areas[].name` | 6パック |
| 39 | `system.backgroundQuestions[]` | classes |
| 39 | `system.connections[]` | classes |
| 23 | `effects[].system.changes[].value.name` | classes, beastforms |
| 20 | `system.examples` | beastforms |
| 18+18 | `pages[].name` / `pages[].text.content` | journals |
| 15 | `effects[].system.duration.description` | 4パック |
| 12+4 | `results[].description` / テーブルの `description` | rolltables |
| 3 | `system.levelupOptionTiers.<tier>.<id>.label` | classes |
| 1 | `system.actions.<id>.countdown[].name` | domains |

`system.attack` は **`Actor` にしか付けていなかった**。武器は Item なので
空振りしていた。工程5で `attack.name` が訳されなかったのと同じ経路で、同じ形の
見落とし。

### journals と rolltables は Babele の既定マッピングが持っていた

`script/mapping/default-mappings.js` に `JournalEntry` (`pages` → `JournalEntryPage`
の `name` / `text.content`) と `RollTable` (`results` → `TableResult`) がある。
マッピングは**キー単位でマージ**されるので、こちらで何も書かなくても届く。
「文書型が未定義」という見立ては誤り。

`TableResult.name` は `referencedDocumentField` で、`documentUuid` の指す
**文書の訳をそのまま使う**。つまり rolltables の `results[].name` 240件は、
参照先の items パックを訳せば自動的に付いてくる。個別に訳す対象ではない。

### 訳してはいけないものを3つ確定した

**`weaponFeatures[].value` (73種) / `armorFeatures[].value` (44種)** は
`reliable` / `fortuneFavored` のような camelCase の列挙キーで、`lang/ja.json`
側で訳される。触らない。

**`advantageOn.<id>.value` は見た目が似ているが別物。** データモデルは素の
`StringField` (Tagify の自由入力、`module/data/item/beastform.mjs:63`) で、
画面にそのまま出る。訳す。

**`effects[].system.changes[].value.name` の25件中22件は i18n キー。**
`"DAGGERHEART.ITEMS.Beastform.attackName"` で、システムが `game.i18n` で解決する。
訳せば画面にキーの文字列が出る。残り3件 (`Brawler's Strike` / `Claws` /
`Claw Swipe`) が本当の固有名。**「オブジェクトだから固有名」という形の判定では
足りない**ことがここで出た。工程5で数式ヒューリスティックを捨てて許可リストに
したのと同じ失敗の形なので、`I18N_KEY` で除外する。

### Babele の `structured` で表現できなかったもの

`structured` は**名前の付いた階層しか降りられない**。`mapping` の値は
translation キー → エントリ内のパスなので、キーが id や添字の階層には名前がない。

- **素の文字列の配列** (`backgroundQuestions` / `connections`)。`structured` は
  エントリにオブジェクトをマージするので、文字列にはマージする先がない。
- **2重キー** (`levelupOptionTiers.<tier>.<id>.label`)。tier も id も名前がない。

そこで `scripts/babele.mjs` で自前のコンバータを2つ登録した
(`game.babele.registerConverters`)。`stringArray` は配列を添字で合わせ、
`leafFields` は**元データ自身の形を再帰**して `fields` に挙げたキーだけ訳す
(ダイス種別やコストは触らない)。

`areas[].name` / `countdown[].name` は `structured` の `mapping` の中に
`structured` を入れ子にすれば届いた。`MappingBlock` が入れ子の定義からも
`FieldMapping` を作るため。

### `apply` がコンテナの種類を推測していた

`system.levelupOptionTiers` は tier 番号 — `"2"` / `"3"` / `"4"` — でキーされた
**オブジェクト**。`apply` は「数字のセグメントなら配列」と**キーの字面から
推測**していたので、ここに配列を作り、`[null,null,null,null,{...}]` を書いた。
`leafFields` はオブジェクトを期待して配列を渡され、何も訳さずに返した。

配列かどうかは**元データ** (`translatableFields(document)`) から読むように直した。
推測をやめただけで、工程5の `carryOver` のバグ (2段決め打ち) と同じ種類の誤り。

### ライセンス未確認でブラウザ検証ができなかったので、Babele のコードを Node で回した

テスト環境を作り直したが、`Config/license.json` が世代11 (`version: 11.293`)
の記録で、アプリは 14.365。サーバは起動するが `/license` に飛ばされる。
ライセンス確認は本人しかできない。

代わりに `tools/mapping-probe.mjs` を書いた。**Babele の `DocumentMappings` /
`ConverterRegistry` / `FieldMapping` を import して実際に動かす**ハーネスで、
モックではない。足りないのはブラウザ側 (compendium runtime、埋め込み文書の走査、
見た目) だけなので、「このマッピングはこのフィールドに届くか」にしか答えない。

```
npm run packs:probe -- <.../Data/modules/babele>
```

**32/32 通った。** しかも1件、実際に落ちたものを捕まえた:
`advantageOn` を `container: "keyed"` + `valuePath: "value"` で書いたところ、
訳が当たらなかった。`StructuredDataConverter._translateValue` は、訳が
プレーンオブジェクトのとき `valuePath` の経路に入らず、`mapping` が空なので
何もマージせずに返す。`mapping: { "value": "value" }` に変えて通った。
`valuePath` は**訳が裸のスカラのとき**の経路で、こちらの出力形
(`advantageOn.<id>.value`) とは噛み合わない。

### 現状

13/15パック有効、45/10,356フィールド。訳したのは機構検証のプローブ15件だけ。
`journals` (SRD 本文 208,012字、ライセンス判断が先) と `rolltables`
(既定マッピングで足り、参照先の訳に追従する) が未有効。

### 実機でも全部通した (ライセンス確認後)

本人にライセンスを通してもらい、公式システム 2.10.9 + 本モジュール +
Babele 2.9.1 + libWrapper で確認した。**13パックすべての翻訳ファイルが
ロードされ、エラーも deprecation 警告も0件。**

| 確認した経路 | 実機の値 |
| --- | --- |
| `attack.name` (武器) | `攻撃`。`range`/ダメージ式は無傷 |
| `areas[].name` | `グリンの書`。`shape`/`size` は無傷 |
| `countdown[].name` | `集団変装` |
| `examples` | `タカ、フクロウ、カラスなど` (シートの「例」欄) |
| `advantageOn` | `欺く` / `発見する` / `威嚇する` (Tagify のタグとして表示) |
| `backgroundQuestions` / `connections` | 3件目だけ日本語、1・2件目は英語のまま。添字照合が効いている |
| `levelupOptionTiers.<tier>.<id>.label` | tier 4 だけ日本語、tier 2 は英語。`subType`/`minCost` は無傷 |
| `changes[].value.name` | `ブロウラーの一撃`。`damageFormula` (`@profd8 + @profd6`) と `trait` は無傷 |
| `durationDescription` | `<p>HPをマークするまで。</p>`。エフェクトシートの4タブすべてで表示 |

**i18n キーを除外した判断も実機で裏が取れた。** ビーストフォームの
`changes[2].value.name` は `DAGGERHEART.ITEMS.Beastform.attackName` のまま残り、
`game.i18n.localize()` が `ビースト攻撃` を返す。訳していたらキー文字列が
出ていた。

レイアウト崩れの走査 (葉要素・日本語・24文字以下・2行以上・幅不足) を
武器 / ビーストフォーム / クラス (質問タブを含む) / ドメインカード /
消耗品 / エフェクトシート4タブに回して **0件**。

## rolltables を入れた。ついでにフォルダ名が訳出経路から漏れていたのを見つけた (2026-10-05)

### rolltables は 5テーブル252件のうち訳すのは23フィールドだけ

`tools/babele-harness.mjs` の `extract` で Babele 自身に訳文ファイルの形を
聞いた結果、**252件の結果のうち240件は `documentUuid` 参照**だった。
`referencedDocumentField` の優先順位は「明示訳 → 参照先文書の訳 → 何もしない」
なので、**items パックを訳せば240件は自動で付いてくる**。ここに名前を書くと
二重管理になり、食い違う余地を作るだけなので**書かない**。

`translatableFields` に RollTable の分岐を足した。RollTable は Actor でも
Item でもなく `system` を持たないので、`document.results` が配列かどうかで
分ける。`documentUuid` を持つ結果は飛ばす。

残りは表5件の名前、説明4件、`text` 型の結果12件の説明で、合計23フィールド。

### フォルダ名89件が `prepare` に出ていなかった

`buildPack` は `folderNames` を作り `apply` は `folders` を書くのに、
**`prepare` は文書しか走査していなかった**。つまり通常の流れでは
フォルダ名に `ja` を入れる場所が存在せず、訳文ファイルを手で編集しない限り
永久に英語のままだった。`report` も数えていないので、進捗率にも出ない。

有効なパックのフォルダ名は **89件 (重複除く)**。`domains` 110個のフォルダは
20種の名前 (Arcana / Blade / Bone ...)、`subclasses` 61個は22種。コンペンディウム
ブラウザに出る文字列なので、訳す対象として扱うべきもの。

フォルダは**英語名でキーされる**ので、id でキーされた pending ファイルに
文書と並べては置けない。予約キー `_folders` の下にまとめ、`apply` が
そこだけ `folderNames` に流すようにした。文書 id は16文字なので衝突しない。

`report` もフォルダ名を数えるようにした。総フィールド数が 10,377 → 10,466 に増えたのは
この89件が見えるようになったため。**件数が増えたのは仕事が増えたのではなく、
今まで数え落としていたものが出てきただけ。**

### 現状

14/15パック有効、55/10,466フィールド。未有効は `journals` のみ
(SRD 本文 208,012字、ライセンス判断が先)。

`npm run packs:probe` は40件に増えた。rolltables では「参照結果の名前が
書き出されていないこと」自体も検査している。

### 訂正: 「参照結果は自動で付いてくる」は実機では成立していなかった

上で「items パックを訳せば rolltables の240件は自動で付いてくる」と書き、
`packs:probe` でも通した。**実機では追従しなかった。**

テーブルが参照している loot アイテム 1件 (`Premium Bedroll` → `高級寝袋`) だけを
訳して確認したところ、テーブルの結果は `Premium Bedroll` のままだった。

原因は `ReferencedDocumentFieldConverter.translate` の呼び出し方。参照先パックに

```js
referencedPack.translateField(referencedField, { [referencedField]: context.value }, runtime);
```

と、**名前だけを渡す**。id が無いので、照合候補は名前1つに絞られる。
一方こちらの訳文ファイルは `_identity.export: ["_id"]` で **id をキーにして
いた**ので、名前では永久に引けない。実機のコンソールで確認:

```
tc.translateField('name', { name: 'Premium Bedroll' })                        → "Premium Bedroll"
tc.translateField('name', { _id: 'QGYPNBIufpBguwjC', name: 'Premium Bedroll' }) → "高級寝袋"
```

**Node のハーネスでは出なかった。** ハーネスは文書型ごとのマッピングを直接
叩いていて、参照解決に必要な「他パックの MappedCompendium」が無いため、
`referencedDocumentField` は `undefined` を返して**失敗せずに素通りする**。
「落ちない」ことと「効いている」ことの差で、実機でしか出ない類の穴だった。

### 訳文ファイルのキーを名前に変えた

`_identity.export` を `["name", "_id"]` に変更し、`packs-sync` の書き出しも
同じ規則にした。**名前が重複するときだけ id に落ちる**。Babele 自身の
`ExportKeys` と同じ順序で、Babele の既定の流儀でもある。

id キーは上流のリネームに強いという利点があったが、その代償が
`referencedDocumentField` の全面不成立 (240件) だった。リネームされた場合は
`report` の "retired upstream" に出るので、黙って古い訳が残るよりは見える。

衝突は2パックだけ: `ancestries` の `Amphibious` ×2 と `beastforms` の
`Carrier` ×3。実機で**同名2件に別々の訳を入れて確認**し、文書もインデックスも
取り違えなしに別々の訳が出た (`_identity.match` が `_id` を先に見るため、
id キー側は id で、名前キー側は名前で引かれる)。

移行は `buildPack` が旧 id キーも見るようにして自動化した。既存の訳は
全件引き継がれている (56件)。

### 実機で確認したこと

| 項目 | 結果 |
| --- | --- |
| 参照結果の追従 | `高級寝袋`。隣の未訳の結果は `Piper Whistle` のまま |
| テーブル名・説明 | `ランダム目標` / `コアセット・アイテム` + 説明文 |
| `text` 型結果の説明 | 2件が日本語、残り10件は英語のまま |
| **フォルダ名** | コンペンディウムブラウザに `コアルール` / `希望と恐怖` |
| 同名文書の衝突 | 2件が別々に訳され、インデックスでも別 |
| キー変更後の回帰 | 工程の全プローブが健在。文書数も 324 / 121 / 210 で不変 |

## journals のライセンス判断を済ませた — 3件を別々に扱う (2026-10-05)

「journals 208,012字のライセンス判断が先」と置いていたものを片付けた。
DPCGL (2025-07-30 版) を読んだ結果、**判断というより条文で決まっていた**。
3件のジャーナルは出自が違い、ひとまとめに扱ったのが間違いだった。

| ジャーナル | 文字数 | 出自 | 結論 |
| --- | --- | --- | --- |
| Daggerheart SRD | 174,510 | SRD 1.0 | 訳せる |
| Welcome - Information | 3,756 | Foundryborne の自作文書 | 訳せる (DRP 無関係) |
| **Witherwild Campaign Frame** | **29,685** | キャンペーンフレーム | **訳せない** |

### 訳せる根拠

- **1.7**: 翻訳は定義上 Adaptive Content (`"translated, altered, rearranged,
  transformed, or otherwise modified"`)。
- **2.1(b)**: Adaptive Content の制作と Share を Permitted Formats で許諾。
- **1.6**: SRD 1.0 は Public Game Content に明示列挙。
- **1.9.1**: Foundry は Whitelisted VTT。現在のリストは Roll20 / Demiplane /
  Foundry / Alchemy / Fantasy Grounds。

### Witherwild が止まる根拠

**1.9.3** が明示的:

> Campaign Frames may not be Shared in any other format or republished,
> printed, distributed, or adapted into new written works or derivative works
> without separate written permission from DRP.

許可されているのはアクチュアルプレイの配信・動画・ポッドキャストだけ。
**1.5(c)** も Campaign Frames を Prohibited Content に列挙している。
日本語訳の同梱は「他の形式での Share」かつ「派生物への改作」の両方に当たる。
**DRP への許諾申請は行わない方針**なので、恒久的に除外する。

### 除外は運用ではなく仕組みで止める

`journals` はパック単位で有効化するので、注意書きだけでは一度の `export` で
書き出されてしまう。`BLOCKED` に文書名で登録し、`readPack` が落とす。

- `export` は落とした文書を `withheld: ... -- 理由` として**毎回出力する**。
  黙って消えるのが一番危ない。
- `check` は、**どんな経路であれ**訳文ファイルに現れていないかを検査する
  (ブロック前の古いエントリも含む)。手で書き込んで発火することを確認済み。
- `packs:probe` でも、上流に存在し、かつ訳文ファイルに無いことを検査する。

### 付随して効く制約2つを明文化した

**非商用限定。** 1.9.1 は Whitelisted VTT 上での Share を非商用に限り、
`"may not be monetized in any form"` として、アクセスの販売・サブスク・
ペイウォール・**アクセスに紐づく寄付の募集**を禁じている。無償配布は要件。

**著作権表記が翻訳物として不正確だった。** 上流の `packs/LICENSE` をそのまま
引くと `"There are no previous modifications by others."` で終わる。4.1(e) は
自分の改変の有無と**他者による先行改変の有無**の表明を求めており、翻訳は改変、
Foundryborne による編集・再構成も先行改変なので、**この一文は偽になる**。

`NOTICE` を新設して 4.1(a)-(e) を満たす形に書き直した。`module.json` の
`readme` / `license` を向け (Foundry がモジュール画面にリンクを出す)、
リリース zip にも同梱する。release ワークフローはタグごとに manifest を
書き換えるので、そこでも両フィールドを維持する。

**ホワイトリストは変わりうる。** 1.9.1 に DRP が随時追加・削除できると明記
されている。Foundry が外れればコンペンディウム翻訳の配布根拠が消えるので、
README に上流追従のたびに確認する旨を書いた。

### 現状

15/15パック有効、62/10,484フィールド。翻訳対象は journals 込みで
208,012字 → **178,266字**。`packs:probe` は50件。

### 実機で確認した。ついでに Credits ページが訳せないことが分かった

| 項目 | 結果 |
| --- | --- |
| ジャーナル3件 | `Daggerheart SRD（日本語）` / `Welcome - Information` / `Witherwild Campaign Frame` |
| Witherwild | **全ページ英語のまま**。除外が実機で効いている |
| ページ名 | 目次に `ダイスロール` |
| ページ本文 | 訳文が表示され、`<a>` も `<em>` も生きている |
| レイアウト崩れ | 0件 |

確認中に **Foundryborne の Credits ページが DPCGL 4.3 の著作権表記そのものを
持っている**ことに気づいた。冒頭が
`"This product includes materials from the Daggerheart System Reference
Document 1.0, © Critical Role, LLC..."` で、末尾が
`"There are no previous modifications by others."`。

**このページは訳せない。** 訳せば、要求されている表記を自分の訳文で置き換える
ことになる。しかもその最後の一文は、本モジュールが何か訳した時点で偽になる。
上流が置いた場所では英語のまま残し、本モジュール自身の 4.1(a)-(e) 表記は
`NOTICE` が負う、という分担にした。

文書単位の `BLOCKED` とは別に `BLOCKED_PAGES` を足し、`export` の withheld 出力、
`check` の検査、`packs:probe` の検査をページ単位でも回るようにした。
ページ側のガードも、手で書き込んで発火することを確認済み。

`packs:probe` は55件。

## 公開前の棚卸しで、工程5のプローブに取り違えが見つかった (2026-10-05)

public 化の可否を確認するため、**配布物に入る訳文62件を全部、原文と並べて
読んだ**。61件は正しく、1件が別文書の訳だった。

`environments` の `Abandoned Grove` に、**`Raging River` の訳が入っていた**。

| フィールド | 原文 | 入っていた訳 |
| --- | --- | --- |
| name | Abandoned Grove | 急流の川 |
| impulses | Draw in the curious, echo the past | 押し流す、孤立させる、渡る者を試す |
| potentialAdversaries (2件) | Beasts / Grove Guardians | 敵役 / 敵役 |

`git log` で `a0d9eea` (工程5の下ごしらえ) の時点から入っていたことを確認した。
名前キー移行 (`234b1ee`) はこれを忠実に運んだだけで、移行のバグではない。

**工程5の報告で「potentialAdversaries label を確認した」と書いたのは、機構に
ついては正しく、内容については誤りだった。** ラベルが UUID 配列を壊さずに
差し替わることは確かに確認できていたが、差し替えた中身が別の環境のもので、
しかも2件とも `敵役` という原文にない語だった。

### なぜ既存の検査を全部すり抜けたか

- `report` は**数える**だけ。訳があるかどうかしか見ない。
- `check` は**エンリッチャを照合**する。どちらにも `@UUID[...]` が無ければ通る。
- `packs:probe` は**機構**を検査する。「訳が当たること」は見るが、
  「当たった訳が正しいか」は見ない。
- 実機確認も通る。表示されている日本語が正しいかは、原文と並べないと分からない。

**動く仕組みを全部通しても、中身の取り違えは出ない。** これから10,423件を訳す
のだから、同じ形の誤りは必ず混入する。

### `packs:audit` を足した

訳文を原文と並べて印字するだけのコマンド。`leaves()` を再利用しているので、
原文の解決は `prepare` と同じ経路で、取りこぼしがない。

```bash
npm run packs:audit
```

机上レビューを**可能にする**だけで、自動では何も判定しない。この種の誤りは
自動判定できない (原文も訳文も存在し、構造も正しい) ので、読める形にして
おくことが唯一の対策になる。

### ついでに外した1件

`Daggerheart SRD` ジャーナルの名前に入れていたプローブ訳
`Daggerheart SRD（日本語）` を外した。中身が英語のままなのに題名だけ「日本語」
と名乗るのは、利用者に対して端的に嘘になる。

## 工程7: 原文書き換えの検出と訳語の一貫性検査

残作業として挙げていた5件のうち、(3) 原文書き換え検出と、その前段に必要な
訳語一貫性検査の2つを実装した。どちらも**翻訳本体 (残り10,423フィールド) に
入る前**に入れておく必要がある種類の仕掛けで、後から足しても遡れない。

### なぜ原文書き換えが見えていなかったか

`lang:report` も `packs:report` もキー集合しか比べていなかった。

| 上流の変化 | 従来の検出 |
| --- | --- |
| キーが増えた | `to translate` に出る |
| キーが消えた | `retired upstream` に出る |
| **同じキーのまま英文が書き換わった** | **どこにも出ない** |

3つ目の場合、旧訳はそのまま残り、しかもあらゆる検査を通過する。キーは存在し、
フィールドは埋まっており、エンリッチャも一致する。`Abandoned Grove` に
`Raging River` の訳が乗っていたのと同じ「全部通るのに内容が違う」型の欠陥で、
10,000フィールド規模では上流リリースごとに確実に発生する。

### 実装: 訳した原文のハッシュを記録する (`tools/sources.mjs`)

訳を適用するたびに、その訳が答えている英文の sha256 (先頭16桁) を
`lang/translation/sources/` に記録する。次回 `report` で現在の原文と突き合わせ、
一致しなければ `reworded` として独立した区分で報告する。未訳 (本文がない) でも
廃止 (キーがない) でもない、第三の状態として扱う。

記録ファイルは `babele/` の外に置いた。Babele はディレクトリ内の JSON を
読むので、保守用の記録を同居させない。

```bash
npm run packs:stamp   # 現在の訳を「今の原文に対して正しい」と宣言する基準づけ
npm run packs:report  # reworded upstream: n
npm run packs:prepare # reworded も作業ファイルに出る (was に旧訳が付く)
npm run packs:check   # reworded があれば失敗する (リリース前の関門)
```

基準づけ (`stamp`) は一度だけ必要で、以降は `apply` が自動で更新する。2回目以降
の `stamp` は「その間に上流が書き換えた分を無検証で承認する」操作になるので、
`report` が報告する状態が残っていれば拒否し、`--force` を要求する。

`prepare` が出す reworded エントリは `ja` を空で出し、旧訳は `was` に添える。
`apply` は空の `ja` を飛ばすので、**誰かが新しい訳を決めるまで出荷中の訳は
そのまま残る**。検出が勝手に文字列を消すことはない。

#### 動作確認

上流参照の `environment_Abandoned_Grove` の impulses を書き換えて確認した。

```
reworded daggerheart.environments / Abandoned Grove :: impulses
   en: Draw in the curious, echo what the past left behind
   ja: 好奇心を引き寄せる、過去を響かせる
```

`check` は `1 problem(s)` で失敗し、`prepare` は `was` 付きで作業ファイルに
出した。原文を戻すと3つとも静かになった。

なお**ドキュメント名**の書き換えは、エントリキーが名前なので従来どおり
`retired upstream` として出る (実測で確認)。新しい検出が効くのは名前以外の
全フィールドで、量としてはそちらが圧倒的に多い。

UI 側 (`lang:report` / `lang:stamp`) も同じ仕組みを入れ、2,256キーを基準づけした。

### 実装: 訳語の一貫性検査 (`npm run packs:terms`)

`report` は数を数え、`audit` は並べて印字し、`check` はエンリッチャとライセンス
境界を見る。どれも「同じ英語が2つのパックで別の日本語になっている」ことには
気づかない。10,000フィールドの翻訳で最も起きやすく、読者が最初に気づく種類の
誤りがこれなので、専用の検査にした。

報告する不一致は3種類:

- `lang/ja.json` の訳語との不一致 (UI の訳が家の作法で、最優先)
- `lang/translation/glossary/*.csv` との不一致
- コンペンディウム内部での不一致 (同じ英語に2つの訳)

比較対象は60文字以下の短いフィールド (名前・ラベル・衝動) に限った。散文は
同一文が再出現しないので、照合してもノイズしか出ない。

CSV 解析・正規化・用語表の読み込みは `lang-sync.mjs` にあった実装を
`tools/glossary.mjs` に出して共用した。UI と コンペンディウムが**同じ辞書を
同じ正規化で**引くことが、この検査の前提になる。

#### 61件に対して3件見つかった

```
daggerheart.transformations / _folders :: Transformation Features
   en:       Transformation Features
   here:     変身の特徴
   lang/ja.json: 変身特徴
daggerheart.domains / _folders :: Blade
   en:       Blade
   here:     ブレード
   lang/ja.json: ブレイド
daggerheart.beastforms / Winged Beast :: advantageOn... :: Scare
   here:     威嚇する
   lang/ja.json: 恐れさせる
```

いずれも `lang/ja.json` の訳語に寄せて修正した。とくに `Blade` は UI では
「ブレイド」、コンペンディウムのフォルダ名では「ブレード」と表示されていた。
同じ画面に並ぶ語で、プローブ訳61件という極小の母数ですでに発生している。
本翻訳に入る前に入れる必要があった、というのはこの意味。

### 現状

```
packs enabled:    15/15
translated:       61
to translate:     10423
retired upstream: 0
reworded upstream: 0
```

`packs:terms` 一致、`packs:check` 問題なし、`packs:probe` 55/55。

### テスト環境は消えていなかった

`packs:probe` が「テスト環境を立て直すまで実行できない」と書いたのは誤りで、
確認の仕方を間違えていた。`find -type d -name babele` で探したが、
`Data/modules/babele` は `babele-src/module` への**シンボリックリンク**なので
`-type d` では一致しない。Babele 2.9.1 は最初から入っていた。

テスト環境そのものも生きていた。工程5で片付けたと思っていたが、スクラッチ
パッド配下のデータパスで Foundry が起動したままだった:

```
dataPath=<scratchpad>/fvtt-test --port=30100 --headless --world=dh-ja
core 14.365 / system daggerheart 2.10.9
Data/modules: babele, lib-wrapper, daggerheart-ja -> リポジトリへのリンク
```

モジュールはリポジトリへのリンクなので、リロードするだけで作業中の訳が乗る。

### 実機で訳語修正を確認した

```
blade フォルダ: ブレイド (ブレード は不在) / UI: ブレイド
transformations フォルダ: 変身特徴            / UI: 変身特徴
有翼の獣 advantageOn: 欺く・発見する・恐れさせる / UI: 恐れさせる
```

コンペンディウムと UI が同じ語になった。`packs:terms` が机上で指摘したことが
画面でもそのとおりだった、という確認。

なお `packs:probe` は訳語修正で1件落ちた (`advantageOn values` が旧訳
`威嚇する` を期待していた)。期待値を更新した。訳語を変えるとプローブが
落ちるのは正しい動作で、**プローブが訳文の内容に対する固定点になっている**
ことの裏付けでもある。

## 工程8: domains パックを訳し切った

211エントリ・1,166フィールド・原文13万字。`packs:report` で 100%。

```
daggerheart.domains          100%  1166/1166 fields
```

### 進め方

`packs:prepare` に2つ足した。

- `--pack=<substring>`: 10,423フィールドの作業ファイルは一度に扱えない。
  コレクション単位で絞る。ファイルはコレクション別のキーで、`apply` は
  見つかったコレクションだけを読むので、絞ったファイルも全体と同じに適用される。
- `lang/ja.json` と用語CSVからの事前補完: 短いフィールドが完全一致したときだけ
  入れる。入るのは `packs:terms` がいずれ要求する値と同じもの。domains では
  1,163フィールド中59件が最初から埋まった。

20エントリずつ、原文を出力 → 訳を JSON で当てる → lint → `apply` →
`export` → `terms`/`check` → コミット、を繰り返した。

### 用語の基準

`lang/ja.json` を第一、SRD用語CSV（1,531語）を第二とした。

| 英語 | 日本語 | 英語 | 日本語 |
| --- | --- | --- | --- |
| Hope / Fear / Stress | 希望 / 恐怖 / ストレス | Melee / Very Close | 近接 / 至近 |
| Armor Score / Slot | 鎧値 / 鎧スロット | Close / Far / Very Far | 近距離 / 遠距離 / 超遠距離 |
| Spellcast Roll | 呪文発動ロール | Long / Short Rest | 大休憩 / 小休憩 |
| Domain Card | 能力カード | Minor / Major / Severe | 軽傷値 / 中傷値 / 重傷値 |
| Adversary | 敵対者 | Proficiency / Evasion | 習熟 / 回避値 |
| Loadout / Vault | ロードアウト / 保管庫 | Vulnerable / Restrained | 脆弱 / 拘束 |

動詞は UI に合わせた。mark → 「ストレスを1マーク」、clear → 「ストレスを消す」、
spend → 「希望を1消費」、gain → 「希望を得る」。

`<X>-Touched` は ja.json の「ドメイン接触」に合わせて「アルカナ接触」などとした。
アクション名は動詞ではなく名詞形（魅了、ストレスをマーク）に揃えた。カード名と
アクション名が同じ英語になることがあり、食い違うと `packs:terms` が報告するため。

### `packs:terms` が実際に止めたもの

- `ストレスをマークする` 対 transformations 既存の `ストレスをマーク`（2件）
- `魅了する`（アクション）対 `魅了`（カード名）
- 工程7で見つけた3件（ブレイド/変身特徴/恐れさせる）

いずれも机上では見落とす。母数61件の時点で3件あったのだから、1,166件なら必ず出る。

### `packs:check` に数値照合を足した

訳文に原文の数値（`2d8+4`、難易度15、しきい値など）がすべて残っているかを検査する。
**訳文を読んでも気づけない種類の誤り**がここにある。読んで自然な日本語でも、
`+1` が落ちていればルールが変わる。

英語が数を語で書く箇所は日本語では数字になるので（`a Hope`→希望を1、
`double`→2倍、`Three Stress`→3つ）、原文の数詞を数字として数え、
裸の `1` は冠詞ぶんとして常に許す。それ以外の余分な数字は「原文にない数量」
として報告する。

#### これで1件見つかった

`transformations / Feed` のアクション説明に、**カード全体の説明文が入っていた**。

```
原文(アクション): On a successful "Fangs" attack ... Place a number of tokens
                  on this card equal to the number of Hit Points the target marks.
旧訳:             ...トークンは同時に6個まで保持できます。アクションロールを行う前に、
                  トークンを1つ消費して恐怖ダイスをd20にできます。長期休憩を取ったとき...
```

原文にない `6` と `d20` が検出の手がかりになった。工程6の `Abandoned Grove` と
同型の誤り（訳文として自然、構造も正しい、ただし原文ではない）で、
`report`・`terms`・`audit`・実機のどれも通っていた。あわせて 長期休憩 →
大休憩 の揺れも直した。

ついでに2件、表現を変えた。`more than once` を「2回以上…できません」ではなく
「選べるのは1回までです」とした。原文にない「2」が出ないほうが、
検査にも読者にも素直。

### 実機確認

```
domains 210件: 英語のまま残った名前 0件
フォルダ: アルカナ/ブレイド/ボーン/コーデックス/恐慄/グレイス/ミッドナイト/
          セージ/スプレンダー/ヴァラー + レベル1〜10
癒しの手: アクション 発動する/HPを1つ回復/HPを2つ回復/ストレスを1つ回復/ストレスを2つ回復
          エフェクト 癒しの手で癒された
```

`packs:check` 問題なし、`packs:terms` 一致、`packs:probe` 55/55。

### 現状

```
packs enabled:    15/15
translated:       1224
to translate:     9260
```

次は subclasses / classes（domains と語彙が重なる）、その後 adversaries /
environments、items/*、最後に journals。

## 工程9: subclasses パックを訳し切った

160エントリ / 660フィールド、フォルダ22種（クラス名13＋基盤特徴・特化特徴・
熟達特徴・サブクラス特徴・武術の構え・ティア1〜4）。クラス名はカタカナに統一
（アサシン/バード/ブロウラー/ドルイド/ガーディアン/レンジャー/ローグ/セラフ/
ソーサラー/ウォーロック/ウォリアー/ウィッチ/ウィザード）。

### 新しく決めた用語

ja.json に無い語は domains の訳語か upstream の定義から決めた。

| 原語 | 訳語 | 根拠 |
| --- | --- | --- |
| Favor | 恩寵 | lang/ja.json |
| Patron Dice | 庇護者ダイス | Favor と対になる Warlock 用語 |
| Prayer Dice | 祈りのダイス | |
| Slayer Dice | 討伐ダイス | |
| Channeling | 伝導 | lang/ja.json |
| Focus（Brawler の資源） | 集中 | lang/ja.json の Focus と同じ |
| Hexed | 呪詛 | classes の Hex 特徴の定義から |
| Glamoured | 幻惑 | |
| Cloaked | 隠身 | domains の Cloaking Blast に合わせた（Hidden は 隠密） |
| Recall（カード） | リコール | カードUIの「リコール」。知識特性の verb は 想起する |
| Restrained | 拘束 | lang/ja.json |
| Martial Stances | 武術の構え | |

Cloaked と Hidden、カードの Recall と知識特性の recall は別語であり、
ここを一語にまとめるとルールが変わる。

### prepare の事前補完が `<p>` を落としていた

辞書は素のテキストを持つのに、コンペンディウムのフィールドは一段落の文書で
あることが多い。`Scary` は `<p>` 無しの裸のテキストとして出ていた。原文が
持っている囲みを戻すようにした。lint の `<p>` 個数チェックが見つけた。

### terms に除外ファイルを足した

`lang/translation/terms-exempt.json`。`Full` は月相の「満月」であり UI の
全回復の「完全」ではない。`Recall` も同様。本物の同形異義語で、放っておくと
永久に報告が出続け、恒常的なノイズの入った報告は読まれなくなる。
除外は1フィールド単位で、理由を併記する。

### terms が空白を差異として報告していた

`plain()` はタグのあった位置に空白を入れる。同じ文を片方は `<strong>` 入りで、
片方は素で書いただけで、日本語では書かない空白の有無が訳語の不一致として
報告されていた。空白を抜いて比較するようにした。

### 実機確認

```
subclasses 160件: 英語のまま残った名前 0件
フォルダ 61個（22種）すべて日本語
月相: アクション 新月：希望を消費 / エフェクト 上弦・満月・下弦
```

`packs:check` 問題なし、`packs:terms` 一致。

### 現状

```
packs enabled:    15/15
translated:       1884
to translate:     8600
```

次は classes、その後 adversaries / environments、items/*、最後に journals。

## 工程10: classes パックを訳し切った

78エントリ / 281フィールド。13クラスの紹介文・背景の問い・つながりの問い、
クラス特徴、そしてクラスアイテム（「50フィートのロープ」「外せない指輪」など
30点）。フォルダ16種（クラス名13＋クラス特徴・クラスアイテム・標準版）。

### 名詞と同じ英語の動詞ボタン

`Hex` と `Commune` は、カード名（名詞）とアクションボタン（動詞）が同じ英語。
最初は 呪詛 / 呪詛する のように訳し分けたが、原文が同一なら訳語も同一にする
のが筋なので、どちらも名詞形に揃えた。terms がこれを拾った。

### 新しく決めた用語

| 原語 | 訳語 |
| --- | --- |
| Combo Die | コンボダイス |
| Unstoppable Die | 止められぬ者ダイス |
| Patron Die | 庇護者ダイス |
| Burden | 負荷（lang/ja.json） |
| Duality Dice | デュアリティダイス（lang/ja.json） |
| Downtime Move | ダウンタイムムーブ（lang/ja.json） |
| Loadout / Vault | ロードアウト / 保管庫（lang/ja.json） |

### 実機確認

```
classes 78件: 英語のまま残った名前 0件
フォルダ16種すべて日本語
ウィッチ: 紹介文・背景の問い3つ・つながりの問い3つすべて日本語
```

`packs:check` 問題なし、`packs:terms` 一致。

### 現状

```
packs enabled:    15/15
translated:       2159
to translate:     8325
```

次は adversaries（4,781フィールド、最大のパック）と environments、
その後 items/*、最後に journals。

## 工程11: adversaries パックを訳し切った

最大のパック。264エントリ、4,781フィールド、フォルダ4種（ティア1〜4）。

### 重複を先に潰した

このパックは**同じ英語が一字一句そのまま何度も現れる**。ミニオンの
撃破文、群れの定型、「恐怖を通常どおり消費してスポットライト」、
リアクションの定型——合わせて約1,850フィールド。写しを一つずつ訳すと
写しの間で表現がずれるので、英語→日本語の表を作り、完全一致を一括で
埋めた（`scratchpad/common.py`）。**1回のパスで1,840フィールド。**

これが副作用として、既に二通りで出荷していた語を確定させた。

| 英語 | 採用 | 退けた理由 |
|---|---|---|
| Relentless | リレントレス | `lang/ja.json` の表記。「執拗」を置換 |
| Activate | 起動する | domains に既出 |
| Swarm | 大群 | Horde に「群れ」を残すため（`lang/ja.json` の敵対者タイプ） |
| Horde | 群れ | 同上 |
| death move | デスムーブ | UIの表記。「死の選択」3件を置換 |

### 定型文は型から生成する

「can be spotlighted up to N times per GM turn」は32箇所にある。一括
パスが23箇所を埋め、その後に手で書いた9箇所が
「GMターンごとに最大3回」と別の言い方になっていた。`terms` には
見えない——term として扱う長さを超えた散文だからだ。主語だけ差し替えて
32箇所すべてを一つの型から作り直した。

### UUIDリンクのラベルは相手の名前と同時に決める

置き換え・召喚・分裂の特徴は `@UUID[…]{ラベル}` で別の敵対者を名指す。
ラベルは自由文なので、**相手エントリの名前を後で変えると食い違う**。
先回りして決めた鎖:

- 埋葬された女帝 →（形態変化）→ 埋葬された猫獣
- 堕ちた軍将：領域を砕く者 → 堕ちた軍将：不敗の覇者（両者が堕ちた者の突撃兵を召喚）
- 火山のドラゴン：黒曜の捕食者 → 溶けた災厄 → 灰の暴君
- 姿を変える魔物 → 正体を現した姿を変える魔物
- 緑のウーズ ⇄ 小さな緑のウーズ、ドライアド → トレントの若木、
  憤怒の魔神・秘密の守り手 → 下級魔神

原文がラベルに短縮名を使う箇所（`{Ashen Tyrant}` に対しエントリ名は
`Volcanic Dragon: Ashen Tyrant`）は短縮形のまま訳した。

### ツールの穴を2つ塞いだ

`check` の数値不変で、正しい訳が弾かれた。原因はどちらも数詞表の不足。

- 「up to twenty targets」→「最大20体」。表が `twelve` で止まっていた。
  `nineteen` まで足し、丸い数（twenty/thirty/forty/fifty/hundred）も入れた。
- 「is doubled」→「2倍」。`double` はあったが `doubled` がなかった。
  これまでの「2倍」が通っていたのは原文が "double damage" の箇所だけ。

### `terms` の死角

`terms` は「1つの英語に2つの日本語」を探す。**逆向きは見ない。**
レッドキャップの `Kneecapper` に「膝砕き」と当てたが、それは
`Jagged Knife Kneebreaker` というエントリの名前で、放置すると特徴名が
別の敵対者への参照に読める。「膝割り」に分けた。異なる英語を1つの
日本語に集めないことは、今のところ人が見るしかない。

### 除外リストに2件追加

- `Sprite`: 敵対者は「スプライト」。ドメインカード「森の妖精」が召喚
  するのは「妖精」で、これはレッドキャップたちを指す語でもある。
- `Mark`: 宝物庫の守護者・歩哨は狙いを定める。ドメインカード
  「報復の紋章」は標を刻む。

### lint が拾ったもの

- 巨人の喧嘩屋の文中に残った英語 `market`
- **キリル文字を2回**。`двойной爪`（Double Claw、工程9）に続いて
  `двойной払い`（Double Swipe）と `влияされる`（Xero）。発生は防げて
  いないが、非日本語文字ルールが毎回その場で止めている。
- 原文の `<strong> </strong>`（空白だけを包む空の強調）を整えて消して
  いた2件。原文の markup は原文のままにする。

### 実機確認

```
adversaries 264件: 英語のまま残った名前 0件
フォルダ4種すべて日本語（ティア1〜4）
UUIDリンク8本すべて相手の名前と一致
@Lookup[@name]・[[/r 1d4]]・@UUID・@Template・<section class="secret"> 保持
```

`packs:check` 問題なし、`packs:terms` 一致、lint 0件。

### 現状

```
packs enabled:    15/15
translated:       6929
to translate:     3555
```

次は environments（933フィールド）、その後 items/*（weapons 982、
consumables 490、loot 346、armors 188）、小さな残り（ancestries 209、
communities 92、beastforms 266、transformations 49、rolltables 23）、
最後に journals（ウィザーワイルドとクレジットは除外）。

## 工程12: environments パックを訳し切った

47エントリ、933フィールド。ティアで分かれていないので、アルファベット順に
1バッチ4〜5エントリで進めた（e1〜e11）。

### 環境パック特有の構造

環境は「カウントダウンを走らせる仕掛け」の集まりで、同じ文が3か所に
重複して載る。

- 特徴（feature）の description に全文
- その特徴の action の description に、発動前の部分だけ
- 別の action の description に、発動後の部分だけ

`Trial by Jury` や `Take Captives` がその形。前半と後半を別々に訳すと
境目で言葉が食い違うので、まず全文を訳してから機械的に切り出した。

`<section class="secret">` のGM質問も同じ文が複数のコピーに載る。原文が
`<em>` で囲んでいるパックとそうでないパックが混ざっているので、コピーごとに
原文のタグをそのまま写す（`check` はタグ数を見るので、整えると落ちる）。

### 確定した用語

| 原語 | 訳語 | 備考 |
| --- | --- | --- |
| Progress Countdown | 進行カウントダウン | |
| Consequence Countdown | 帰結カウントダウン | |
| Dynamic Countdown | ダイナミックカウントダウン | UIの「ダイナミックトークン」に倣った |
| Judgment Die | 審判ダイス | Time Court 固有 |
| Morale Die | 士気ダイス | Raiding Party 固有 |
| Air Supply Countdown | 空気残量カウントダウン | Sunken Citadel と Volcanic Eruption で共有 |
| Faded | 褪色した | Realm Of The Dead 固有の敵対者状態 |
| Pitched Battle | 激戦 | Castle Siege の本文から先に決まっていた |
| Apply（単独） | 適用 | 他は「○○を適用」 |

### 落とし穴: babele を直接直すと apply で巻き戻る

`terms` の指摘に合わせて `babele/ja/*.json` を直接書き換えたところ、
次のバッチで `apply` を走らせた時点で `packs-pending.json` の古い値に
上書きされ、同じ3件が再び報告された。

**修正は `packs-pending.json` 側に入れる。** babele は apply の出力なので、
そこだけ直しても次の apply で消える。

### 環境→敵対者の参照

環境の本文は敵対者を名前で呼ぶ。`@UUID` が張られているものは Babele が
解決してくれるが、素の文中の名前（`Storm Giant`、`Deep Dweller`、
`Temporal Enforcer`、`Demon of Avarice`、`Vault Guardian Gaoler`）は
ただの文字列なので、adversaries パックの既訳を引いて揃えるしかない。
`Redcap Biters` のように複数形で登録されている項目があるので、
単数形で引くと空振りする。

### 原文の綴り

fi/fl の合字が崩れた箇所が大量にある（`identifi es`、`profi t`、
`diff erence`、`unfl edged`、`refl ect`、`fi nd`）。ほかに `succceeds`、
`Appky`（action 名）、`their their` の重複。いずれも意図どおりに訳した。

### 検証

```
daggerheart.environments     100%  933/933 fields
47エントリ: 英語のまま残った名前 0件
英語のまま残った特徴名を持つエントリ 0件
```

`packs:check` 問題なし、`packs:terms` 一致、lint 0件。
実機（localhost:30100 / dh-ja）で再読み込みして確認済み。

### 現状

```
packs enabled:    15/15
translated:       8617
to translate:     1867
```

次は items/*（weapons 982、consumables 490、loot 346、armors 188）。
weapons 56% と armors 48% は工程11で意図せず入った prefill で、
まだ1フィールドずつ読んでいない機械出力なので、読み直しが必要。
その後 小さな残り（ancestries 209、communities 92、beastforms 266、
transformations 49、rolltables 23）、最後に journals（ウィザーワイルドと
クレジットは除外）。
