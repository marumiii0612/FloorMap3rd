# ROOMU — 早稲田キャンパス3号館 空き教室ナビ（非公式・授業用デモ）

公開URL（GitHub Pages を main/(root) に設定した場合）: https://marumiii0612.github.io/FloorMap3rd/

- [地図と入退室デモ](https://marumiii0612.github.io/FloorMap3rd/)
- [ドア掲示用QRコード・印刷](https://marumiii0612.github.io/FloorMap3rd/posters.html)

## 使い方
1. メイン画面で1〜3階の架空フロアマップ、混雑率、用途（自習・昼食・面接）を確認。
2. `posters.html` で18教室のQRを生成し、必要な教室のA4掲示物を印刷。
3. スマートフォンでQRを読み、URLを開くと、その教室の入室状態が**その端末上だけ**で記録される。
4. 同じQRを再読込しても同一端末は二重計上しない。別室への移動で切り替え。退室ボタンで終了。

## 公開設定
GitHub → Settings → Pages → Build and deployment → **Deploy from a branch** → **main / (root)** → Save。
Settings > Pages に表示されるURLが利用可能になるまでの間は、上記リンクが404になることがあります。

## ファイル
- `index.html`: 完結型・配布用ページ（CSS/JSとQRロジック内蔵）
- `style.css`, `app.js`, `vendor/qr.js`: 今後の改修用に分離したソース
- `posters.html`: QRポスター印刷用ページ

## 制限と安全上の注意
- **人数はサンプル値であり、他のスマートフォンに同期されません。** GitHub Pages だけで共有在室人数の集計はできません。共有人数には Firebase / Supabase 等が別途必要です。
- **固定QRを読み取ることは本人確認・実際の在室証明ではありません。** URLを共有すれば現地にいなくても操作可能です。学内セキュリティの認証用途には使用できません。
- 掲載の3階建て・18教室・教室番号・授業時刻・混雑人数は全て架空です。大学公認サイトではありません。実際の大学内に無許可で掲示しないでください。
- GPSはページ起動中に許可された場合のみ利用でき、ブラウザ終了後の30分自動退室やバックグラウンド通知は保証できません。
- 利用者テストに際して、学内規程、施設の許可、個人情報保護に留意してください。

QRコード生成実装は Kazuhiko Arase 氏の実装に由来するコードを含みます。利用に際して元ライセンスを遵守してください。

## 公開できない場合（404）

GitHub のリポジトリの **Settings → Pages → Build and deployment** で `Deploy from a branch`、`main`、`/(root)` を選択してください。
設定後は公開まで数分かかることがあります。404 が続く場合は Settings → Pages にサイト URL が表示されているか、Actions に Pages の公開履歴が表示されるか確認してください。
