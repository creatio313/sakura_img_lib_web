import type { Task } from "@/types/media";
import { dokApi, required, sakuraFetch } from "./auth";
import { assertSiteBucket } from "./object-storage";
import { s3EndpointUrl, storageCredential } from "./storage-config";
import type { Site } from "@/types/media";

const taskTag = "imglib";
type Operation = "generate" | "edit" | "superres";
type TaskInput = { bucket: string; outputBucket?: string; keys?: string[]; prompt?: string; prefix?: string; suffix?: string; batch?: number; scale?: number };

const imageExtensions = /\.(jpe?g|png|gif|webp)$/i;
function assertImageKey(key: string) {
  if (!imageExtensions.test(key)) throw new Error("対応画像形式は JPG、PNG、GIF、WebP です。");
}

export async function createTask(site: Site, operation: Operation, input: TaskInput) {
  if (input.outputBucket) assertSiteBucket(site, input.outputBucket);
  const credential = storageCredential(site.id);
  const common = { registry: required("DOK_REGISTRY"), command: [], plan: "h100-80gb" };

  let container: Record<string, unknown>;

  if (operation === "generate") {
  // 画像生成の場合
    if (!input.prompt?.trim() || !input.prefix?.trim()) throw new Error("ファイル名接頭辞とプロンプトは必須です。");
    container = { ...common, image: required("DOK_FLUX_IMAGE"), entrypoint: ["/docker-entrypoint.sh"], environment: { BATCH: String(Math.max(1, input.batch ?? 1)), PROMPT: JSON.stringify([[input.prefix, input.prompt]]), OBJST_BUCKET: input.bucket, OBJST_ENDPOINT: s3EndpointUrl(site.s3Endpoint), OBJST_SECRET: credential.secretAccessKey, OBJST_TOKEN: credential.accessKeyId, STEPS: "8" } };
  } else if (operation === "edit") {
  // 画像編集の場合
    if (!input.prompt?.trim() || !input.suffix?.trim() || !input.keys?.length) throw new Error("画像キー、プロンプト、接尾辞は必須です。");
    input.keys.forEach(assertImageKey);
    container = { ...common, image: required("DOK_FLUX_IMAGE"), entrypoint: ["/docker-entrypoint-img2img.sh"], environment: { PROMPT: JSON.stringify(input.keys.map((key) => [key, input.prompt, input.suffix])), OBJST_INPUT_BUCKET: input.bucket, OBJST_OUTPUT_BUCKET: input.outputBucket, OBJST_ENDPOINT: s3EndpointUrl(site.s3Endpoint), OBJST_SECRET: credential.secretAccessKey, OBJST_TOKEN: credential.accessKeyId, STEPS: "8" } };
  } else {
  // 超解像の場合
    if (!input.suffix?.trim() || !input.keys?.length || !input.scale || input.scale < 1) throw new Error("画像キー、倍率、接尾辞は必須です。");
    input.keys.forEach(assertImageKey);
    container = { ...common, image: required("DOK_REALESRGAN_IMAGE"), entrypoint: ["/docker-entrypoint.sh"], environment: { INPUT_BUCKET: input.bucket, OUTPUT_BUCKET: input.outputBucket, TASKS: JSON.stringify(input.keys.map((key) => [key, input.scale, input.suffix])), S3_ENDPOINT: s3EndpointUrl(site.s3Endpoint), S3_SECRET: credential.secretAccessKey, S3_TOKEN: credential.accessKeyId } };
  }
  const labels = { generate: "画像生成", edit: "画像編集", superres: "超解像" };
  const response = await sakuraFetch(`${dokApi}/tasks/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${labels[operation]}-${Date.now()}`, containers: [container], tags: [taskTag] }) });
  return (await response.json()) as Task;
}

export async function listTasks(): Promise<Task[]> {
  const response = await sakuraFetch(`${dokApi}/tasks/?page=1&page_size=20&tag=${taskTag}`);
  const data = (await response.json()) as { results: Task[] };
  return data.results;
}
