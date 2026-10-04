# Daggerheart 日本語化 (非公式)

Foundry VTT の [Daggerheart システム (Foundryborne/daggerheart)](https://github.com/Foundryborne/daggerheart)
の UI を日本語化する、非公式のモジュールです。

**公式システムをそのまま使います。** システムを置き換えないので、
公式システム向けのモジュールと併用できます。日英の切り替えは、
このモジュールを有効化するか無効化するかだけです。

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

ワールドの「設定 > モジュール管理」で有効化したあと、
Foundry の言語設定を日本語にしてください。

## 翻訳の範囲

| 対象 | 状況 |
| --- | --- |
| システムの UI 文言 (`lang/ja.json`) | 対応済み |
| 日本語で崩れるレイアウトの CSS 修正 | 対応済み |
| コンペンディウム収録内容 (能力カード、敵、装備など) | **未対応**。[Babele](https://foundryvtt.com/packages/babele) 経由で対応予定 |
| システムのコードに直接書かれた一部の文言 | **対応不可**。モジュールからは上書きできません |

## 以前のシステム版 (`daggerheart-ja` システム) から移行する

このモジュールの前身は、システムそのものを日本語化したフォーク
([kenken-trpg/daggerheart](https://github.com/kenken-trpg/daggerheart)) でした。
システム版は**非推奨**です。公式システム向けのモジュールが使えないためです。

移行手順:

1. 公式の Daggerheart システムをインストールする。
2. このモジュールをインストールして有効化する。
3. 既存の daggerheart-ja ワールドを開くには、ワールドの `world.json` の `"system"` を
   `"daggerheart-ja"` から `"daggerheart"` に書き換える。
4. システム版 (`daggerheart-ja` システム) をアンインストールする。

## 開発

翻訳の運用方法は [`lang/translation/README.md`](lang/translation/README.md) にあります。

```bash
npm run reference    # 上流の lang/en.json を参照用に取得する
npm run lang:report  # 原文との差分状況を確認する
```

## ライセンス

- このリポジトリの CSS と JavaScript は [MIT License](LICENSE)。
- `lang/ja.json` は上流 `lang/en.json` の訳です。Daggerheart System Reference
  Document 由来のルール文を含むため、その部分は
  [Darrington Press Community Gaming License](https://darringtonpress.com/wp-content/uploads/2025/07/DPCGL-July-30th-2025.pdf)
  の許諾範囲に依存します。
- Darrington Press™, Daggerheart™ およびそれぞれのロゴは Critical Role, LLC の
  商標です。

このモジュールは非公式であり、Critical Role, LLC、Darrington Press、
Foundryborne のいずれとも関係がありません。
