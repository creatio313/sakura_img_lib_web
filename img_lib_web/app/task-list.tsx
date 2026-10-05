"use client";

import { Task } from "./media-api";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

type TaskListProps = {
  tasks: Task[];
  busy: boolean;
  onRefresh: () => void;
};

export function TaskList({ tasks, busy, onRefresh }: TaskListProps) {
  return (
    <section className="pt-8 pb-36">
      <div className="mb-[18px] flex items-center justify-between gap-4 max-[760px]:flex-col max-[760px]:items-start">
        <h2>AI処理状況</h2>
        <button onClick={onRefresh} disabled={busy} title="更新" aria-label="更新">
          <ArrowPathIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <table>
            <thead>
              <tr>
                <th scope="col">タスク名</th>
                <th scope="col">タスクID</th>
                <th scope="col">ステータス</th>
                <th scope="col">作成日時</th>
                <th scope="col">エラー</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.name}</td>
                  <td>{task.id}</td>
                  <td>{task.status}</td>
                  <td>
                    {task.created_at ? new Date(task.created_at).toLocaleString("ja-JP") : "-"}
                  </td>
                  <td>{task.error_message || "-"}</td>
                </tr>
              ))}
              {!tasks.length && (
                <tr>
                  <td colSpan={5}>このアプリが登録したタスクはまだありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
