/* eslint-disable @next/next/no-img-element */
"use client";

import { ImageItem } from "./media-api";
import { BackwardIcon, ForwardIcon, PencilIcon } from "@heroicons/react/24/outline";

type ObjectGridProps = {
  images: ImageItem[];
  selected: string[];
  urls: Record<string, string>;
  busy: boolean;
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onToggle: (key: string) => void;
  onRename: (key: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function ObjectGrid({
  images,
  selected,
  urls,
  busy,
  page,
  hasPreviousPage,
  hasNextPage,
  onToggle,
  onRename,
  onPreviousPage,
  onNextPage,
}: ObjectGridProps) {
  return (
    <>
      <ul role="list" className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:gap-x-8">
        {images.map((image) => {
          const previewUrl = urls[image.key];
          const fileName = image.key.split("/").at(-1) ?? image.key;
          const isSelected = selected.includes(image.key);

          return (
            <li className="relative min-w-0" key={image.key}>
              <button
                type="button"
                className={`group relative block aspect-[10/7] w-full overflow-hidden rounded-lg bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:bg-gray-800 ${isSelected ? "ring-2 ring-red-700 ring-offset-2" : ""}`}
                disabled={!previewUrl}
                onClick={() => previewUrl && window.open(previewUrl, "_blank", "noopener,noreferrer")}
                aria-label={`${fileName}を新しいタブで開く`}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={image.key}
                    className="pointer-events-none h-full w-full rounded-lg object-cover outline outline-1 -outline-offset-1 outline-black/5 transition-opacity group-hover:opacity-75 dark:outline-white/10"
                  />
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">プレビューを読み込み中</span>
                )}
              </button>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="group grid size-4 shrink-0 grid-cols-1">
                      <input
                        type="checkbox"
                        className="col-start-1 row-start-1 size-4 appearance-none rounded-sm border border-gray-300 bg-white p-0 outline-none checked:border-red-700 checked:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-white/10 dark:bg-white/5 dark:checked:border-red-500 dark:checked:bg-red-500 forced-colors:appearance-auto"
                        checked={isSelected}
                        onChange={() => onToggle(image.key)}
                        aria-label={`${fileName}を選択`}
                      />
                      <svg
                        fill="none"
                        viewBox="0 0 14 14"
                        aria-hidden="true"
                        className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white dark:group-has-disabled:stroke-white/25"
                      > 
                        <path
                          d="M3 8L6 11L11 3.5"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="opacity-0 group-has-checked:opacity-100"
                        />
                      </svg>
                    </div>
                    <p className="pointer-events-none min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white" title={image.key}>
                      {fileName}
                    </p>
                  </div>
                  <p className="pointer-events-none mt-1 truncate text-sm text-gray-500 dark:text-gray-400" title={image.key}>
                    {image.key}
                  </p>
                  <p className="pointer-events-none truncate text-sm text-gray-500 dark:text-gray-400">
                    {image.size.toLocaleString()} bytes
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                  onClick={() => onRename(image.key)}
                  title="キーを変更"
                  aria-label="キーを変更"
                >
                  <PencilIcon aria-hidden="true" className="size-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {!images.length && !busy && <p>サイト、バケット、キー接頭辞を選択して表示します。</p>}
      {(images.length > 0 || page > 1 || hasNextPage) && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onPreviousPage}
            disabled={!hasPreviousPage || busy}
            title="前へ"
            aria-label="前へ"
          >
            <BackwardIcon aria-hidden="true" className="size-5" />
          </button>
          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{page} ページ目</span>
          <button
            type="button"
            onClick={onNextPage}
            disabled={!hasNextPage || busy}
            title="次へ"
            aria-label="次へ"
          >
            <ForwardIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
