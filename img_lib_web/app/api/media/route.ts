import { NextResponse } from "next/server";
import type { MediaRequest } from "@/types/media-api";
import { createTask, listTasks } from "@/lib/sakura/dok-tasks";
import { deleteImages, listImages, listSites, previewImage, renameImage, selectedSite, uploadImage } from "@/lib/sakura/object-storage";

// ブラウザから受けた全操作を action で振り分けるサーバー側の HTTP 境界です。
// ここで入力形式とサイト・バケットを確認してから、認証情報を扱う Sakura のドメイン処理へ渡します。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

function isBody(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(body: Body, key: string) {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function optionalText(body: Body, key: string) {
  return typeof body[key] === "string" ? body[key].trim() || undefined : undefined;
}

function strings(body: Body, key: string) {
  return Array.isArray(body[key]) && body[key].every((item) => typeof item === "string") ? body[key] as string[] : [];
}

function number(body: Body, key: string) {
  return typeof body[key] === "number" && Number.isFinite(body[key]) ? body[key] : undefined;
}

function requireContext(body: Body) {
  const siteId = text(body, "siteId");
  const bucket = text(body, "bucket");
  if (!siteId || !bucket) throw new Error("サイトとバケットを指定してください。");
  return { siteId, bucket };
}

function parseRequest(value: unknown): MediaRequest {
  if (!isBody(value)) throw new Error("リクエスト形式が不正です。");
  const action = text(value, "action");
  if (action === "catalog" || action === "tasks") return { action };

  const { siteId, bucket } = requireContext(value);
  if (action === "list") return { action, siteId, bucket, prefix: text(value, "prefix"), continuationToken: optionalText(value, "continuationToken") };
  if (action === "preview") return { action, siteId, bucket, key: text(value, "key") };
  if (action === "upload") return { action, siteId, bucket, key: text(value, "key"), data: text(value, "data"), contentType: optionalText(value, "contentType") };
  if (action === "delete") return { action, siteId, bucket, keys: strings(value, "keys") };
  if (action === "rename") return { action, siteId, bucket, oldKey: text(value, "oldKey"), newKey: text(value, "newKey") };
  if (action === "generate" || action === "edit" || action === "superres") {
    return { action, siteId, bucket, outputBucket: optionalText(value, "outputBucket"), keys: strings(value, "keys"), prompt: optionalText(value, "prompt"), prefix: optionalText(value, "prefix"), suffix: optionalText(value, "suffix"), batch: number(value, "batch"), scale: number(value, "scale") };
  }
  throw new Error("不明な操作です。");
}

// Route Handler は JSON の解釈、ドメイン処理の呼び出し、HTTP レスポンスへの変換だけを担当します。
export async function POST(request: Request) {
  try {
    const input = parseRequest(await request.json());

    // サイトとバケットの選択肢を初期表示・再読み込み用に返します。
    if (input.action === "catalog") return NextResponse.json({ sites: await listSites() });

    // このアプリが登録した DOK タスクを返します。
    if (input.action === "tasks") return NextResponse.json(await listTasks());

    const site = selectedSite(await listSites(), input.siteId, input.bucket);

    // オブジェクトストレージ内の画像一覧をページ単位で返します。
    if (input.action === "list") return NextResponse.json(await listImages(site, input.bucket, input.prefix, input.continuationToken));

    // 画像本体ではなく、短時間だけ有効な署名付き URL を返します。
    if (input.action === "preview") return NextResponse.json({ url: await previewImage(site, input.bucket, input.key) });

    // ブラウザから受け取った Base64 データを画像オブジェクトとして保存します。
    if (input.action === "upload") {
      await uploadImage(site, input.bucket, input.key, input.data, input.contentType);
      return NextResponse.json({ ok: true });
    }

    // 選択された画像を削除し、実際に削除できたキーを返します。
    if (input.action === "delete") return NextResponse.json(await deleteImages(site, input.bucket, input.keys));

    // オブジェクトストレージ上でコピー後に元オブジェクトを削除してキーを変更します。
    if (input.action === "rename") {
      await renameImage(site, input.bucket, input.oldKey, input.newKey);
      return NextResponse.json({ ok: true });
    }

    // generate / edit / superres の内容に応じた DOK タスクを登録します。
    const task = await createTask(site, input.action, { bucket: input.bucket, outputBucket: input.outputBucket || input.bucket, keys: input.keys, prompt: input.prompt, prefix: input.prefix, suffix: input.suffix, batch: input.batch, scale: input.scale });
    return NextResponse.json({ task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "処理に失敗しました。";
    const status = message === "不明な操作です。" || message === "リクエスト形式が不正です。" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
