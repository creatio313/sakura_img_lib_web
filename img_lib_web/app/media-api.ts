import type { Site } from "@/types/media";
import type { MediaRequest, MediaResponse } from "@/types/media-api";

// ブラウザ側からサーバーの Route Handler を呼び出す通信窓口です。
// 操作ごとのリクエスト・レスポンス型は types/media-api.ts に集約し、画面側で API 形式を直接組み立てないようにします。
export type { ImageItem, Site, Task } from "@/types/media";

// action からレスポンス型を推論し、APIと画面側の利用結果を一致させます。
export async function request<Action extends MediaRequest>(data: Action): Promise<MediaResponse<Action["action"]>> {
  const response = await fetch("/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await response.json()) as MediaResponse<Action["action"]> & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "処理に失敗しました。");
  return result;
}

export function siteLabel(site: Site) {
  return site.displayNameJa ?? site.displayName ?? site.displayNameEnUs ?? site.id;
}
