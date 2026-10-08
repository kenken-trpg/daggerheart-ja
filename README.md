# Daggerheart 日本語化 (非公式)

Foundry VTT の [Daggerheart システム (Foundryborne/daggerheart)](https://github.com/Foundryborne/daggerheart)
を日本語化する、非公式のモジュールです。UI だけでなく、コンペンディウム収録内容
(敵対者・環境・クラス・ドメインの能力カード・装備・SRD ジャーナルなど
15 パック 10,484 フィールド) も訳してあります。

**公式システムをそのまま使います。** システムを置き換えないので、
公式システム向けのモジュールと併用できます。日英の切り替えは、
このモジュールを有効化するか無効化するかだけです。

## 動作環境

| | 必要 | 確認済み |
| --- | --- | --- |
| Foundry VTT | 14.364 以上 | 14.368 |
| daggerheart システム | 2.10.7 以上 | 2.10.9 |

## インストール

Foundry の「モジュール管理 > モジュールをインストール」で、マニフェスト URL に
次を貼ってください。

```
https://raw.githubusercontent.com/kenken-trpg/daggerheart-ja/main/module.json
```

あわせて次を入れてください。

| モジュール | 役目 |
| --- | --- |
| [Japanese \[JA\] Translation](https://foundryvtt.com/packages/foundryVTTja) | Foundry 本体の UI を日本語化する。入れないと素の UI が英語のままになる |
| [Babele](https://foundryvtt.com/packages/babele) | コンペンディウム収録内容の翻訳に使う。入れないとカードやデータブロックが英語のままになる |
| [libWrapper](https://foundryvtt.com/packages/lib-wrapper) | Babele が動作に必要とする |

ワールドの「設定 > モジュール管理」で有効化したあと、
Foundry の言語設定を日本語にしてください。

インストール済みのモジュールは、セットアップ画面の「モジュール管理」から
更新してください。0.1.1 では能力値名を「敏捷・筋力・技巧・本能・存在・知識」に
統一しています。更新後にワールドを開き直すと、シートや判定の表示に反映されます。

Babele はコンペンディウムを書き換えません。読み込み時に訳を重ねるだけなので、
公式システムのパックはそのまま残り、英語に戻すのはこのモジュールを
無効化するだけです。

## 翻訳の範囲

| 対象 | 状況 |
| --- | --- |
| システムの UI 文言 (`lang/ja.json`) | 対応済み |
| 日本語で崩れるレイアウトの CSS 修正 | 対応済み |
| コンペンディウム収録内容 (能力カード、敵、装備など) | 対応済み。[Babele](https://foundryvtt.com/packages/babele) 経由で 15 パック 10,484 フィールド |
| システムのコードに直接書かれた一部の文言 | **対応不可**。モジュールからは上書きできません |

## 以前のシステム版 (`daggerheart-ja` システム) から移行する

このモジュールの前身は、システムそのものを日本語化したフォーク
([kenken-trpg/daggerheart](https://github.com/kenken-trpg/daggerheart)) でした。
システム版は**非推奨**です。公式システム向けのモジュールが使えないためです。

移行手順:

1. 公式の Daggerheart システムをインストールする。
2. このモジュールをインストールして有効化する。
3. 既存の daggerheart-ja ワールドを開くには、ワールドの `world.json` の `"system"` を
   `"daggerheart-ja"` から `"daggerheart"` に書き換える。Foundry の画面からは
   ワールドのシステムを変更できないため、ファイルを直接編集する必要があります。
4. システム版 (`daggerheart-ja` システム) をアンインストールする。

3 について、注意が1つあります。システム版は ID 改名のとき flags とコンペンディウムの
名前空間も `daggerheart-ja` に変えていました。そのため、システム版で遊んでいた期間に
書かれた `flags.daggerheart-ja` や `Compendium.daggerheart-ja.*` への参照は、
公式システムでは解決されません。アクターやアイテムの数値 (`system.*`) は
名前空間に依存しないので残りますが、不安があれば新しいワールドを作り、
アクターとアイテムをエクスポート/インポートしてください。

## 開発

翻訳の運用方法は [`lang/translation/README.md`](https://github.com/kenken-trpg/daggerheart-ja/blob/main/lang/translation/README.md) にあります。

```bash
npm run reference     # 上流の lang/en.json を参照用に取得する
npm run lang:report   # UI 文言の原文との差分状況を確認する
npm run packs:report  # コンペンディウム訳の進捗と、上流更新で古くなった訳を見る
npm run packs:check   # ライセンス境界と enricher/数値の保全を検査する
npm run packs:terms   # 訳語の揺れ (同じ英語に別の訳) を検査する
```

外部の対訳資料を取り込むか判断するときは、`glossary/` に置かずに比較できます。
`--count` は何も書かず、衝突した用語と影響フィールド数だけを報告します。

```bash
node tools/packs-sync.mjs diff --from=<path.csv> --count   # コンペンディウム側
node tools/lang-sync.mjs  diff --from=<path.csv> --count   # UI 側
```

`packs:check` と `packs:terms` は GitHub Actions でも毎コミット走ります。
`packs:check` はリリースの zip を作る前にも走るので、Witherwild 除外は
手作業ではなくビルドで担保されています。

### 更新を配布する

`main` への push だけでは、インストール済みモジュールには更新が届きません。
Foundry はマニフェストの `version` で更新を判定し、`download` に指定された
リリースの ZIP を取得します。

1. `module.json` と `package.json` の `version` を同じ新しい版に上げ、
   `module.json` の `download` をその版の `module.zip` に変更する。
2. 翻訳の検査を実行し、変更をコミットして `main` に push する。
3. そのコミットを指すタグ（例: `0.1.1`）で GitHub Release を公開する。
   Release ワークフローが `module.json` と `module.zip` を添付したことを確認する。
4. 公開マニフェスト URL から隔離した FVTT 環境へインストールし、
   配布されたバージョンと日本語表示を確認する。ローカルリポジトリへの
   シンボリックリンクを使った実演だけでは、配布経路の確認にはならない。

## 不具合・訳語の報告

訳の誤りや崩れたレイアウトは
[Issues](https://github.com/kenken-trpg/daggerheart-ja/issues) へお願いします。
報告のとき Foundry とシステムのバージョン、該当する画面か文言があると助かります。

## ライセンス

- このリポジトリの CSS・JavaScript・ツール類は [MIT License](LICENSE)。
- 翻訳したルール文・コンペンディウム内容については [NOTICE](NOTICE) を参照して
  ください。Daggerheart System Reference Document 1.0 © Critical Role, LLC 由来の
  素材を、[Darrington Press Community Gaming License](https://darringtonpress.com/wp-content/uploads/2025/07/DPCGL-July-30th-2025.pdf)
  (DPCGL) の条件のもとで含みます。
- Darrington Press™, Daggerheart™ およびそれぞれのロゴは Critical Role, LLC の
  商標です。

このモジュールは非公式であり、Critical Role, LLC、Darrington Press、
Foundryborne のいずれとも関係がありません (DPCGL 2.3)。

### 非商用限定

**本モジュールは無償であり、無償でなければなりません。** DPCGL 1.9.1 は
ホワイトリスト VTT 上での Share を非商用に限り、いかなる形の収益化も
禁じています — アクセスの販売、サブスクリプション、ペイウォール、そして
**アクセスや利用に紐づく寄付の募集**も含みます。

### Foundry がホワイトリストから外れたら

DPCGL 1.9.1 のホワイトリスト VTT は Darrington Press が管理しており、
**随時変更されうる**と明記されています。現在のリストは
https://darringtonpress.com/license/ にあり、執筆時点では Roll20 / Demiplane /
Foundry / Alchemy / Fantasy Grounds です。Foundry が外れた場合、コンペンディウム
翻訳の配布根拠が失われます。上流追従のたびに確認してください。

### 意図的に含めていないもの

**Witherwild Campaign Frame は翻訳も同梱もしていません。** DPCGL 1.9.3 により、
キャンペーンフレームはアクチュアルプレイの配信・動画・ポッドキャスト以外の
形式での Share と派生物への改作が、DRP の個別の書面許諾なしには認められない
ためです。許諾申請は行っていません。

この除外はビルドで強制しています (`tools/packs-sync.mjs` の `BLOCKED`)。
`npm run packs:check` が、訳文ファイルに紛れ込んでいないことを検査します。
また `npm run packs:terms` が訳語の揺れ (同じ英語に別の訳) を、
`npm run packs:report` が上流の原文書き換えによって古くなった訳を報告します。
