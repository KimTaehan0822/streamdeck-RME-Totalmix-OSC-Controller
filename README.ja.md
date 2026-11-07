# RME TotalMix – Stream Deck プラグイン

[한국어](README.md) | [English](README.en.md) | **日本語**

Elgato Stream Deck のキーとダイヤルで **RME TotalMix FX** を操作するプラグインです。フェーダー、ミュート、ソロ、ゲイン、FX、スナップショットをキー1つで扱え、キーとダイヤルの画面にレベルメーターを表示できます。TotalMix の **Global OSC** で直接通信するので、ほかのプログラムは必要ありません。

## ダウンロード

[最新リリース](https://github.com/KimTaehan0822/streamdeck-RME-Totalmix-OSC-Controller/releases/latest)ページから `RME-TotalMix-StreamDeck-v<バージョン>.zip` をダウンロードして展開します。中身は次のとおりです。

- `RME-TotalMix.streamDeckPlugin`: インストールファイル
- 取扱説明書 PDF(言語ごとに1つ)
  - `RME TotalMix 스트림덱 플러그인 사용설명서.pdf`: 韓国語
  - `RME TotalMix Stream Deck Plugin Manual (English).pdf`: 英語
  - `RME TotalMix Stream Deck プラグイン 取扱説明書 (日本語).pdf`: 日本語
- `THIRD-PARTY-NOTICES.txt`: 使用しているオープンソースの告知

## 必要なもの

- Windows
- Stream Deck ソフトウェア 7.3 以降
- **TotalMix FX 2.1 以降**: Global OSC が必要です。それより前のバージョンには対応していません。
- ダイヤルのアクションには Stream Deck + が必要です。キーのアクションはすべての Stream Deck で使えます。

## クイックスタート

### 1. プラグインをインストール

`RME-TotalMix.streamDeckPlugin` をダブルクリックし、Stream Deck ソフトウェアがインストールを確認したら承認します。

### 2. TotalMix で OSC をオンにする

1. **Options → Enable OSC Control** をオンにします。このスイッチがオフだと、TotalMix は OSC をまったく受け付けません。
2. OSC 設定で **incoming ポートを 7001**、**outgoing ポートを 9001** にします。
3. **Remote Controller Address → IP or Host Name** に `127.0.0.1` を入れます。TotalMix と Stream Deck が同じ PC にある場合の値です。Windows ではこの欄が空だと TotalMix が状態を送り返しません。
4. **Compatibility (Mode)** で **Global OSC** を選び、**Details** を開いて次のように設定します。

| TotalMix の項目 | 設定 |
| --- | --- |
| Send changes | オン(必須) |
| Send all data on start | オフ |
| Send status | オン(推奨) |
| Re-send received | オン(推奨) |
| Send faders in linear scale | どちらでも可(両方対応) |

5. レベルメーターを表示するには、OSC のメイン設定で **Send Peak Level Data** をオンにし、**Peak Hold** をオフにします。

### 3. 最初のキーを作る

1. Stream Deck ソフトウェアのアクション一覧で **RME TotalMix OSC Controller** カテゴリを開きます。
2. たとえば **Fader(2-Button)** を2つのキーにドラッグします。片方を上げる、もう片方を下げるキーにし、同じチャンネルを選びます。
3. TotalMix に接続する前はチャンネルリストが 1〜48 の番号で表示され、接続すると実際のチャンネル名に変わります。

## 接続設定(ポート)

いずれかのアクションを選び、設定画面のいちばん下にある **▸ TotalMix connection (OSC)** を開きます。この設定はすべてのアクションで共通です。

| 項目 | 初期値 |
| --- | --- |
| Host | `127.0.0.1` |
| TotalMix port | `7001` |
| Feedback port | `9001` |
| Sync timeout (ms) | `500` |

**OSC ポートがほかのプログラムと重なる場合**、たとえば Bitfocus Companion の TotalMix モジュールのように同じポートを使うプログラムを同時に起動している場合は、ポートを変更してください。TotalMix で2つ目の OSC リモートをオンにして別のポート(例: incoming 7002 / outgoing 9002)を設定し、上の **TotalMix port** と **Feedback port** にも同じ番号を入れます。ポートの変更は Stream Deck を再起動しなくても反映されます。

## 設定画面の言語

設定画面のいちばん下にある **▸ Language** を開き、**English / 한국어 / 日本語** から選びます。選ぶとすぐに設定画面の文字が変わり、すべてのアクションに適用されます。初期値は English です。キーに表示される文字(OFFLINE など)とアクション一覧の名前は変わりません。

## アクション一覧

**チャンネルキー**

| アクション | できること |
| --- | --- |
| Mute / Solo | チャンネルのミュート、ソロ |
| Input option | 48V、Inst、Pad、AutoSet のオン/オフ |
| Output loopback | 出力ループバックのオン/オフ |
| Group | グループの設定、切り替え |

**値を調整するキー**(押し続けると繰り返します)

| アクション | できること |
| --- | --- |
| Fader(2-Button) | 2つのキーでフェーダーを上げ下げ。キーにレベルメーター表示 |
| Fader | フェーダーを指定した値にする、または指定した分だけ上げ下げ |
| Pan | パンの設定または調整 |
| Input gain | 入力ゲインの上げ下げ |
| Global FX (Reverb / Echo) | グローバルリバーブ、エコーのオン/オフ |
| FX parameter | FX パラメーターの設定または調整 |

**ダイヤル(Stream Deck +)**

| アクション | 回すと | 押すと |
| --- | --- | --- |
| VU Dial | フェーダー調整、レベルメーター表示 | ミュート(変更可) |
| Pan Dial | パン調整 | 中央へ |
| Gain Dial | ゲイン調整 | ミュート、48V、Pad などから選んだ機能 |
| FX Parameter Dial | FX パラメーター調整 | リセット値へ |

VU Dial は設定画面の **▸ Press actions** で、押したときと、押したまま左右に回したときに別の動作(ミュートのオン/オフ、指定した音量に戻すなど)を選べます。

**グローバルキー**

| アクション | できること |
| --- | --- |
| Snapshot | スナップショットを番号で呼び出し |
| Control Room | コントロールルーム機能 |
| Layout preset / TotalMix window | 画面レイアウト、ウィンドウ切り替え |

各アクションの詳しいオプションは、同梱の PDF 取扱説明書をご覧ください。

## キーに表示される文字

| 表示 | 意味 | 対処 |
| --- | --- | --- |
| **OFFLINE** | TotalMix から応答がない | TotalMix の起動、Enable OSC Control、ポート、ファイアウォールを確認 |
| **N/A** | この機器にない機能 | 例: 48V がない入力。別のチャンネルを選んでください |
| **SET CHANNEL** | チャンネルがまだ選ばれていない | 設定画面でチャンネルを選ぶ |
| **SETUP** | ほかの必須設定が空 | 設定画面で入力 |

## トラブルシューティング

- **ずっと OFFLINE のまま:** TotalMix の OSC ポートとプラグインの TotalMix port / Feedback port が合っているか確認してください。ほかのプログラムが同じポートを使っている場合は、上の「接続設定」のとおりポートを変更してください。
- **レベルメーターが動かない:** TotalMix で Send Peak Level Data がオンになっているか確認してください。
- **キーを離したのに繰り返しが止まらない:** そのキーをもう一度押すと止まります。Multi Action の中では繰り返さず1回だけ動作します。

## 自分でビルドする

```bash
npm install
npm run pack
```

`npm run pack` を実行すると `.streamDeckPlugin` ファイルが作られます。

## 告知

このプラグインが使用しているオープンソースのライセンスは `THIRD-PARTY-NOTICES.txt` にあります。RME、TotalMix は RME Audio の商標です。このプラグインは RME とは関係のない非公式プロジェクトです。
