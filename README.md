# 概要
さくらのクラウドのオブジェクトストレージにある画像の一覧、追加、キー変更、削除、プレビューを行うNext.jsアプリケーションです。選択画像のAI編集・超解像、AI画像生成を高火力 DOK タスクとして登録します。対応画像形式は JPG、PNG、GIF、WebP です。

`img_lib_web/.env` に次を設定します。

```dotenv
NEXT_PUBLIC_SITE_URL=https://example.internal
SAKURA_SERVICE_PRINCIPAL_RESOURCE_ID=
SAKURA_SERVICE_PRINCIPAL_KID=
SAKURA_SERVICE_PRINCIPAL_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

OBJECT_STORAGE_ISK01_ACCESS_KEY_ID=
OBJECT_STORAGE_ISK01_SECRET_ACCESS_KEY=
OBJECT_STORAGE_TKY01_ACCESS_KEY_ID=
OBJECT_STORAGE_TKY01_SECRET_ACCESS_KEY=

DOK_FLUX_IMAGE=
DOK_REALESRGAN_IMAGE=
DOK_REGISTRY=
```

`DOK_REGISTRY` には、事前登録済みの高火力 DOK/レジストリ認証情報のIDを設定します。

高火力 DOK タスクには `imglib` タグを付与し、タスク一覧もこのタグで絞り込みます。

# フォルダ・ファイルの役割

```text
img_lib_web/
├─ app/
│  ├─ page.tsx                  # 初期データを取得して画面に渡す Server Component
│  ├─ layout.tsx                # アプリ共通レイアウトとメタデータ
│  ├─ globals.css               # 全画面共通スタイル
│  ├─ media-library.tsx         # 画面全体の状態とユーザー操作の調停
│  ├─ media-api.ts              # ブラウザから Route Handler を呼ぶ共通関数
│  ├─ object-grid.tsx           # オブジェクト一覧とページング表示
│  ├─ media-modal.tsx           # アップロード・AI処理・キー変更フォーム
│  ├─ task-list.tsx             # DOK タスク一覧表示
│  ├─ use-notices.ts            # 通知表示の状態管理
│  └─ api/media/route.ts        # API の action 振り分けと入力検証
├─ public/                      # OGP 画像などの静的アセット
│  ├─ favicon.ico
│  └─ ogp.jpg
├─ types/
│  ├─ media.ts                  # Site、Task、ImageItem など共有ドメイン型
│  └─ media-api.ts              # action 別リクエスト・レスポンス契約
└─ lib/
    └─ sakura/
        ├─ auth.ts              # サービスプリンシパル認証と Sakura API 共通 fetch
        ├─ storage-config.ts    # S3 エンドポイントとサイト別資格情報
        ├─ object-storage.ts    # サイト・バケット・画像オブジェクト操作
        └─ dok-tasks.ts         # 高火力 DOK タスクの登録・一覧取得
```