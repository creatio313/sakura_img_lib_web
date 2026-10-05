import type { ImageListResult, Site, Task } from "./media";

// ブラウザから Route Handler へ送る JSON の契約です。
// action ごとに必要な項目を分け、画面側とサーバー側でリクエスト形式を共有します。
export type MediaRequest =
  // サイトとバケットの一覧を取得します。
  | { action: "catalog" }
  // このアプリが登録した DOK タスクの一覧を取得します。
  | { action: "tasks" }
  // オブジェクトストレージ内の画像一覧を取得します。
  | { action: "list"; siteId: string; bucket: string; prefix: string; continuationToken?: string }
  // 指定画像の署名付きプレビュー URL を取得します。
  | { action: "preview"; siteId: string; bucket: string; key: string }
  // 画像をオブジェクトストレージへアップロードします。
  | { action: "upload"; siteId: string; bucket: string; key: string; data: string; contentType?: string }
  // 選択した画像を削除します。
  | { action: "delete"; siteId: string; bucket: string; keys: string[] }
  // 画像のオブジェクトキーを変更します。
  | { action: "rename"; siteId: string; bucket: string; oldKey: string; newKey: string }
  // 高火力 DOK に画像生成、画像編集、超解像のタスクを登録します。
  | {
      action: "generate" | "edit" | "superres";
      siteId: string;
      bucket: string;
      outputBucket?: string;
      keys?: string[];
      prompt?: string;
      prefix?: string;
      suffix?: string;
      batch?: number;
      scale?: number;
    };

  // action とレスポンス形式の対応表です。
  // MediaResponse と組み合わせることで、呼び出し側が action に応じた戻り値を取得できます。
export type MediaResponseMap = {
  // catalog に対応するサイト一覧です。
  catalog: { sites: Site[] };
  // tasks に対応する DOK タスク一覧です。
  tasks: Task[];
  // list に対応する画像一覧とページング情報です。
  list: ImageListResult;
  // preview に対応する署名付き URL です。
  preview: { url: string };
  // upload の成功結果です。
  upload: { ok: true };
  // delete で削除できたキーの一覧です。
  delete: { deleted: string[]; errors: { key?: string; code?: string; message?: string }[] };
  // rename の成功結果です。
  rename: { ok: true };
  // DOK タスク登録系 action の結果です。
  generate: { task: Task };
  edit: { task: Task };
  superres: { task: Task };
};

// リクエストの action から対応するレスポンス型を取り出します。
export type MediaResponse<Action extends keyof MediaResponseMap> = MediaResponseMap[Action];
