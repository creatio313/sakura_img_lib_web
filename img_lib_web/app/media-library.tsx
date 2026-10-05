"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Transition } from "@headlessui/react";
import { ArrowUpRightIcon, ArrowUpTrayIcon, CheckCircleIcon, ExclamationCircleIcon, MagnifyingGlassIcon, PaintBrushIcon, SparklesIcon, TrashIcon } from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { request, siteLabel } from "./media-api";
import type { ImageItem, ImageListResult, Site, Task } from "@/types/media";
import { MediaModal, ModalType } from "./media-modal";
import { ObjectGrid } from "./object-grid";
import { TaskList } from "./task-list";
import { useNotices } from "./use-notices";

type MediaLibraryProps = {
  initialSites?: Site[];
  initialTasks?: Task[];
  initialError?: string;
};

type PreviewResult = { key: string; url: string };

type NoticeToastProps = {
  message: string;
  error?: boolean;
  show: boolean;
  onClose: () => void;
};

function NoticeToast({ message, error = false, show, onClose }: NoticeToastProps) {
  const StatusIcon = error ? ExclamationCircleIcon : CheckCircleIcon;

  return (
    <Transition show={show}>
      <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-white shadow-lg outline-1 outline-black/5 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0 dark:bg-gray-800 dark:-outline-offset-1 dark:outline-white/10">
        <div className="p-4">
          <div className="flex items-start">
            <div className="shrink-0">
              <StatusIcon aria-hidden="true" className={`size-6 ${error ? "text-red-500" : "text-green-500"}`} />
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{message}</p>
            </div>
            <div className="ml-4 flex shrink-0">
              <button
                type="button"
                onClick={onClose}
                aria-label="通知を閉じる"
                className="inline-flex rounded-md bg-transparent p-0 text-gray-400 shadow-none hover:bg-transparent hover:text-gray-500 focus:outline-2 focus:outline-offset-2 focus:outline-red-600 dark:hover:text-white dark:focus:outline-red-500"
              >
                <XMarkIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  );
}

export default function MediaLibrary({ initialSites = [], initialTasks = [], initialError }: MediaLibraryProps) {
  const firstSite = initialSites[0];
  const firstBucket = firstSite?.buckets[0]?.name ?? "";
  const sites = initialSites;
  const [siteId, setSiteId] = useState(firstSite?.id ?? "");
  const [bucket, setBucket] = useState(firstBucket);
  const [prefix, setPrefix] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const { notices, notify: notice, dismiss } = useNotices();
  const [initialNotice, setInitialNotice] = useState(initialError ?? "");
  const [modal, setModal] = useState<ModalType>(null);
  const [busy, setBusy] = useState(false);
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [prompt, setPrompt] = useState("");
  const [outputPrefix, setOutputPrefix] = useState("generated");
  const [suffix, setSuffix] = useState("");
  const [outputBucket, setOutputBucket] = useState(firstBucket);
  const [batch, setBatch] = useState(1);
  const [scale, setScale] = useState(4);
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState("");
  const [oldKey, setOldKey] = useState("");
  const [newKey, setNewKey] = useState("");

  const site = useMemo(() => sites.find((item) => item.id === siteId), [sites, siteId]);
  const buckets = site?.buckets ?? [];

  function resetObjects() {
    setImages([]);
    setSelected([]);
    setUrls({});
    setPageTokens([undefined]);
    setPageIndex(0);
    setNextToken(undefined);
  }

  async function taskList() {
    try {
      setTasks(await request({ action: "tasks" }));
    } catch (error) {
      notice(error instanceof Error ? error.message : "タスク一覧を取得できませんでした。", true);
    }
  }

  async function previewImages(nextImages: ImageItem[]) {
    const previews = await Promise.allSettled(
      nextImages.map(async (image): Promise<PreviewResult> => {
        const preview = await request({ action: "preview", siteId, bucket, key: image.key });
        return { key: image.key, url: preview.url };
      }),
    );

    setUrls(
      Object.fromEntries(
        previews.flatMap((result) => (result.status === "fulfilled" ? [[result.value.key, result.value.url]] : [])),
      ),
    );
  }

  async function imageList(token?: string, nextPageIndex = 0) {
    if (!siteId || !bucket) return;
    setBusy(true);
    try {
      const result: ImageListResult = await request({ action: "list", siteId, bucket, prefix, continuationToken: token });
      setImages(result.objects);
      setSelected([]);
      setUrls({});
      setPageIndex(nextPageIndex);
      setNextToken(result.nextContinuationToken);
      setPageTokens((tokens) => {
        const nextTokens = tokens.slice(0, nextPageIndex + 1);
        nextTokens[nextPageIndex] = token;
        if (result.nextContinuationToken) nextTokens[nextPageIndex + 1] = result.nextContinuationToken;
        return nextTokens;
      });
      await previewImages(result.objects);
      notice(`${result.objects.length} 件の画像を表示しました。`);
    } catch (error) {
      notice(error instanceof Error ? error.message : "画像を取得できませんでした。", true);
    } finally {
      setBusy(false);
    }
  }

  function open(type: Exclude<ModalType, null>, key = "") {
    setModal(type);
    setPrompt("");
    setSuffix("");
    setOutputPrefix("generated");
    setBatch(1);
    setScale(4);
    setOutputBucket(bucket);
    setFile(null);
    setUploadKey("");
    setOldKey(key);
    setNewKey(key);
  }

  function chooseSite(event: ChangeEvent<HTMLSelectElement>) {
    const id = event.target.value;
    const next = sites.find((item) => item.id === id);
    const nextBucket = next?.buckets[0]?.name ?? "";
    setSiteId(id);
    setBucket(nextBucket);
    setOutputBucket(nextBucket);
    resetObjects();
  }

  function chooseBucket(event: ChangeEvent<HTMLSelectElement>) {
    const nextBucket = event.target.value;
    setBucket(nextBucket);
    setOutputBucket(nextBucket);
    resetObjects();
  }

  function toggle(key: string) {
    setSelected((items) => (items.includes(key) ? items.filter((item) => item !== key) : [...items, key]));
  }

  async function base64(fileToEncode: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("ファイルを読み込めませんでした。")));
      reader.onerror = () => reject(new Error("ファイルを読み込めませんでした。"));
      reader.readAsDataURL(fileToEncode);
    });
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }

  async function deleteSelected() {
    if (!selected.length) return;
    setBusy(true);
    try {
      const result = await request({ action: "delete", siteId, bucket, keys: selected });
      setImages((items) => items.filter((item) => !result.deleted.includes(item.key)));
      const remaining = selected.filter((key) => !result.deleted.includes(key));
      setSelected(remaining);
      if (remaining.length) {
        const detail = result.errors[0]?.message ?? result.errors[0]?.code;
        notice(`${result.deleted.length} 件を削除しました。${remaining.length} 件の削除に失敗しました。${detail ? ` ${detail}` : ""}`, true);
      } else {
        notice(`${result.deleted.length} 件の画像を削除しました。`);
      }
    } catch (error) {
      notice(error instanceof Error ? error.message : "削除できませんでした。", true);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setBusy(true);
    try {
      if (modal === "upload") {
        if (!file || !uploadKey) throw new Error("画像ファイルとオブジェクトキーを指定してください。");
        await request({ action: "upload", siteId, bucket, key: uploadKey, data: await base64(file), contentType: file.type });
        notice("画像を追加しました。");
      } else if (modal === "rename") {
        await request({ action: "rename", siteId, bucket, oldKey, newKey });
        notice("キーを変更しました。");
      } else {
        const result = await request({ action: modal, siteId, bucket, outputBucket, keys: selected, prompt, prefix: outputPrefix, suffix, batch, scale });
        notice(`${result.task.name} を登録しました。`);
        await taskList();
      }
      setModal(null);
      await imageList(pageTokens[pageIndex], pageIndex);
    } catch (error) {
      notice(error instanceof Error ? error.message : "処理に失敗しました。", true);
    } finally {
      setBusy(false);
    }
  }

  function nextPage() {
    if (nextToken) void imageList(nextToken, pageIndex + 1);
  }

  function previousPage() {
    if (pageIndex > 0) void imageList(pageTokens[pageIndex - 1], pageIndex - 1);
  }

  return (
    <main className="mx-auto w-[calc(100%-48px)] max-w-[1440px] pt-[30px] pb-16 max-[760px]:w-[calc(100%-24px)] max-[760px]:pt-[18px]">
      <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-[80] flex items-end px-4 py-6 sm:items-start sm:p-6">
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          <NoticeToast message={initialNotice} error show={Boolean(initialNotice)} onClose={() => setInitialNotice("")} />
        {notices.map((item) => (
            <NoticeToast key={item.id} message={item.message} error={item.error} show={item.visible} onClose={() => dismiss(item.id)} />
        ))}
        </div>
      </div>

      <header className="md:flex md:items-center md:justify-between">
        <h1 className="min-w-0 flex-1 text-2xl/7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">画像管理支援電算処理システム</h1>
      </header>

      <section className="grid grid-cols-[1fr_1fr_minmax(220px,1.2fr)_auto] items-end gap-[14px] border-b border-[var(--border)] py-[22px] max-[760px]:grid-cols-1">
        <label>
          サイト
          <select value={siteId} onChange={chooseSite}>
            <option value="">選択してください</option>
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {siteLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          バケット
          <select value={bucket} onChange={chooseBucket}>
            <option value="">選択してください</option>
            {buckets.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          キー接頭辞
          <input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="images/" />
        </label>
        <button
          type="button"
          className="inline-flex items-center justify-center max-[760px]:size-10 max-[760px]:justify-self-end"
          onClick={() => void imageList()}
          disabled={!bucket || busy}
          title="画像を検索"
          aria-label="画像を検索"
        >
          <MagnifyingGlassIcon aria-hidden="true" className="size-5" />
        </button>
        {site?.bucketFetchError && <small className="media-error">{site.bucketFetchError}</small>}
      </section>

      <section className="pt-8">
        <div className="mb-[18px] flex items-center justify-between gap-4 max-[760px]:flex-col max-[760px]:items-start">
          <div>
            <h2 className="m-0">
              {bucket || "バケットを選択"}
              <small className="ml-3 font-mono text-xs font-normal text-[var(--ink-muted)]">このページ: {images.length} 枚</small>
            </h2>
          </div>
          <div className="flex flex-wrap justify-end gap-[7px] max-[760px]:justify-start">
            <button type="button" onClick={() => open("upload")} disabled={!bucket || busy} title="アップロード" aria-label="アップロード">
              <ArrowUpTrayIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => open("generate")} disabled={!bucket || busy} title="AI 生成" aria-label="AI 生成">
              <PaintBrushIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => open("edit")} disabled={!selected.length || busy} title="AI 編集" aria-label="AI 編集">
              <SparklesIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => open("superres")} disabled={!selected.length || busy} title="超解像" aria-label="超解像">
              <ArrowUpRightIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => void deleteSelected()} disabled={!selected.length || busy} title={`削除 (${selected.length}件)`} aria-label={`選択した${selected.length}件の画像を削除`}>
              <TrashIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        <ObjectGrid
          images={images}
          selected={selected}
          urls={urls}
          busy={busy}
          page={pageIndex + 1}
          hasPreviousPage={pageIndex > 0}
          hasNextPage={Boolean(nextToken)}
          onToggle={toggle}
          onRename={(key) => open("rename", key)}
          onPreviousPage={previousPage}
          onNextPage={nextPage}
        />
      </section>

      <TaskList tasks={tasks} busy={busy} onRefresh={() => void taskList()} />

      {modal && (
        <MediaModal
          modal={modal}
          buckets={buckets}
          busy={busy}
          prompt={prompt}
          outputPrefix={outputPrefix}
          suffix={suffix}
          outputBucket={outputBucket}
          batch={batch}
          scale={scale}
          uploadKey={uploadKey}
          oldKey={oldKey}
          newKey={newKey}
          onClose={() => setModal(null)}
          onSubmit={(event) => void submit(event)}
          onFileChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next) setUploadKey(next.name);
          }}
          onUploadKeyChange={setUploadKey}
          onPromptChange={setPrompt}
          onOutputPrefixChange={setOutputPrefix}
          onOutputBucketChange={setOutputBucket}
          onBatchChange={setBatch}
          onScaleChange={setScale}
          onSuffixChange={setSuffix}
          onNewKeyChange={setNewKey}
        />
      )}
    </main>
  );
}
