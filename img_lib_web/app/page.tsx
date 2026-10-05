import MediaLibrary from "./media-library";
import type { Site, Task } from "@/types/media";
import { listSites } from "@/lib/sakura/object-storage";
import { listTasks } from "@/lib/sakura/dok-tasks";

export const dynamic = "force-dynamic";

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "初期データを取得できませんでした。";
}

export default async function Home() {
  // サイト・バケット一覧、タスク一覧取得
  const [sitesResult, tasksResult] = await Promise.allSettled([listSites(), listTasks()]);
  const initialSites: Site[] = sitesResult.status === "fulfilled" ? sitesResult.value : [];
  const initialTasks: Task[] = tasksResult.status === "fulfilled" ? tasksResult.value : [];
  const initialErrors = [sitesResult, tasksResult].flatMap((result) => result.status === "rejected" ? [messageOf(result.reason)] : []);

  return <MediaLibrary initialSites={initialSites} initialTasks={initialTasks} initialError={initialErrors.join("\n")} />;
}