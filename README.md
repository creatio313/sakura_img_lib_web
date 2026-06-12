# 概要
オブジェクトストレージに格納された画像をプレビュー・管理できる簡易Webアプリケーションです。
AI処理にも対応しています。
対応画像フォーマットはjpg, png, gif, webpです。

# 構成
## docker
AppRun共用型でホストするAPIサーバです。設定する環境変数は以下の通り：
- PORT：待ち受けポート
- CORS_ALLOWED_ORIGINS：許可する呼び出し元オリジン
- DOK_FLUX_IMAGE：画像生成・加工AIをホストしているコンテナレジストリ
- DOK_REALESRGAN_IMAGE：超解像AIをホストしているコンテナレジストリ
AIのソースは私の別リポジトリを参照してください。

## img_lib_web
Next.jsで構築したSPAです。
.envファイルにAPIサーバのURLとSPAをホストするURLを入力して、npm run buildすれば動きます。
