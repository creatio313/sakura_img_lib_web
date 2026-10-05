"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ChangeEvent, FormEvent } from "react";
import { Site } from "./media-api";

export type ModalType = "upload" | "generate" | "edit" | "superres" | "rename" | null;

type MediaModalProps = {
  modal: Exclude<ModalType, null>;
  buckets: Site["buckets"];
  busy: boolean;
  prompt: string;
  outputPrefix: string;
  suffix: string;
  outputBucket: string;
  batch: number;
  scale: number;
  uploadKey: string;
  oldKey: string;
  newKey: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadKeyChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onOutputPrefixChange: (value: string) => void;
  onOutputBucketChange: (value: string) => void;
  onBatchChange: (value: number) => void;
  onScaleChange: (value: number) => void;
  onSuffixChange: (value: string) => void;
  onNewKeyChange: (value: string) => void;
};

function modalTitle(modal: Exclude<ModalType, null>) {
  if (modal === "upload") return "画像追加";
  if (modal === "generate") return "AI 画像生成";
  if (modal === "edit") return "AI 画像編集";
  if (modal === "superres") return "AI 超解像";
  return "キーを変更";
}

export function MediaModal({
  modal,
  buckets,
  busy,
  prompt,
  outputPrefix,
  suffix,
  outputBucket,
  batch,
  scale,
  uploadKey,
  oldKey,
  newKey,
  onClose,
  onSubmit,
  onFileChange,
  onUploadKeyChange,
  onPromptChange,
  onOutputPrefixChange,
  onOutputBucketChange,
  onBatchChange,
  onScaleChange,
  onSuffixChange,
  onNewKeyChange,
}: MediaModalProps) {
  return (
    <Dialog open onClose={() => !busy && onClose()} className="relative z-10">
      <DialogBackdrop transition className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/50" />
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            as="form"
            transition
            className="relative grid max-h-[calc(100dvh-2rem)] w-full gap-3.5 overflow-y-auto rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:max-w-lg sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800 dark:outline dark:-outline-offset-1 dark:outline-white/10"
            onSubmit={onSubmit}
          >
          <div className="flex items-center justify-between gap-4">
            <DialogTitle as="h3" className="text-base font-semibold text-gray-900 dark:text-white">{modalTitle(modal)}</DialogTitle>
            <button type="button" className="rounded-full bg-stone-600 p-1.5 text-white shadow-xs hover:bg-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-600 dark:bg-stone-500 dark:shadow-none dark:hover:bg-stone-400 dark:focus-visible:outline-stone-500" onClick={onClose} disabled={busy} aria-label="閉じる">
              <XMarkIcon aria-hidden="true" className="size-5" />
            </button>
          </div>

          {modal === "upload" && (
            <>
              <label htmlFor="image-file">
                画像ファイル
              </label>
              <input id="image-file" type="file" required accept="image/jpeg,image/png,image/gif,image/webp" onChange={onFileChange} />
              <label htmlFor="upload-key">
                オブジェクトキー
              </label>
              <input id="upload-key" required value={uploadKey} onChange={(event) => onUploadKeyChange(event.target.value)} />
            </>
          )}

          {modal === "generate" && (
            <>
              <label htmlFor="output-prefix">
                出力キー接頭辞
              </label>
              <input id="output-prefix" required value={outputPrefix} onChange={(event) => onOutputPrefixChange(event.target.value)} />
              <label htmlFor="prompt">
                プロンプト
              </label>
              <textarea id="prompt" required rows={4} value={prompt} onChange={(event) => onPromptChange(event.target.value)} />
              <label htmlFor="batch">
                生成枚数
              </label>
              <input id="batch" type="number" min="1" value={batch} onChange={(event) => onBatchChange(Number(event.target.value) || 1)} />
            </>
          )}

          {(modal === "edit" || modal === "superres") && (
            <>
              <label htmlFor="output-bucket">
                出力バケット
              </label>
              <select id="output-bucket" value={outputBucket} onChange={(event) => onOutputBucketChange(event.target.value)}>
                {buckets.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </>
          )}

          {modal === "edit" && (
            <>
              <label htmlFor="prompt">
                プロンプト
              </label>
              <textarea id="prompt" required rows={4} value={prompt} onChange={(event) => onPromptChange(event.target.value)} />
            </>
          )}

          {modal === "superres" && (
            <>
              <label htmlFor="scale">
                倍率
              </label>
              <input id="scale" type="number" min="1" value={scale} onChange={(event) => onScaleChange(Number(event.target.value) || 1)} />
            </>
          )}

          {(modal === "edit" || modal === "superres") && (
            <>
              <label htmlFor="suffix">
                ファイル名接尾辞
              </label>
              <input id="suffix" required value={suffix} onChange={(event) => onSuffixChange(event.target.value)} />
            </>
          )}

          {modal === "rename" && (
            <>
              <label htmlFor="old-key">
                現在のキー
              </label>
              <input id="old-key" value={oldKey} readOnly />
              <label htmlFor="new-key">
                新しいキー
              </label>
              <input id="new-key" required value={newKey} onChange={(event) => onNewKeyChange(event.target.value)} />
            </>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={busy} aria-label={busy ? "処理中" : "実行"} title={busy ? "処理中" : "実行"}>
              <CheckIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}
