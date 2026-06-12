"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type Site = {
  id: string;
  region?: string;
  displayName?: string;
  displayNameJa?: string;
  displayNameEnUs?: string;
  s3Endpoint?: string;
  buckets: Bucket[];
  bucketFetchError?: string;
};

type Bucket = {
  name: string;
  resourceId?: string;
  plan?: {
    type?: string;
    serviceClassPath?: string;
  };
};

type SitesResponse = {
  sites: Site[];
};

type ImageObject = {
  key: string;
  size: number;
  etag?: string;
  lastModified?: string;
};

type SearchResponse = {
  objects: ImageObject[];
  isTruncated: boolean;
  nextContinuationToken?: string;
  endpointUsed?: string;
};

type PreviewResponse = {
  previewUrl: string;
};

type DeleteObjectsResponse = {
  bucket: string;
  deleted: string[];
  count: number;
};

type UploadObjectResponse = {
  bucket: string;
  key: string;
  size: number;
  contentType: string;
};

type RenameObjectKeyResponse = {
  bucket: string;
  oldKey: string;
  newKey: string;
};

type AITaskCreateResponse = {
  taskId: string;
  name?: string;
  status?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  canceledAt?: string | null;
  httpUri?: string | null;
  errorMessage?: string;
  executionTimeLimitSec?: number | null;
  containers?: AITaskContainer[];
  artifact?: AITaskArtifact;
  operation?: string;
  containerImage?: string;
  plan?: string;
  message: string;
};

type AITaskArtifact = {
  id: string;
  filename: string;
  sizeBytes: number;
  downloadUrl?: string;
};

type AITaskContainer = {
  image: string;
  plan: string;
};

type AITaskItem = {
  id: string;
  name: string;
  status: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  containers: AITaskContainer[];
  artifact?: AITaskArtifact;
};

type AITaskListResponse = {
  tag: string;
  tasks: AITaskItem[];
};

type ModalType = "upload" | "generate" | "edit" | "superres" | "rename" | null;

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export default function Home() {
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenSecret, setAccessTokenSecret] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [bucket, setBucket] = useState("");

  const [prefix, setPrefix] = useState("");
  const [query, setQuery] = useState("");
  const [nextContinuationToken, setNextContinuationToken] = useState("");
  const [isTruncated, setIsTruncated] = useState(false);

  const [objects, setObjects] = useState<ImageObject[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewLoadingKeys, setPreviewLoadingKeys] = useState<
    Record<string, boolean>
  >({});

  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [runningAIAction, setRunningAIAction] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [status, setStatus] = useState("待機中");
  const [error, setError] = useState("");

  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalOutputBucket, setModalOutputBucket] = useState("");
  const [modalUploadFile, setModalUploadFile] = useState<File | null>(null);
  const [modalUploadKey, setModalUploadKey] = useState("");
  const [modalPrefix, setModalPrefix] = useState("AI生成画像");
  const [modalPrompt, setModalPrompt] = useState("");
  const [modalSuffix, setModalSuffix] = useState("");
  const [modalBatch, setModalBatch] = useState(1);
  const [modalScale, setModalScale] = useState(4);
  const [renameTargetKey, setRenameTargetKey] = useState("");
  const [modalNewKey, setModalNewKey] = useState("");

  const [aiTasks, setAiTasks] = useState<AITaskItem[]>([]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === siteId),
    [sites, siteId],
  );
  const buckets = useMemo(() => selectedSite?.buckets ?? [], [selectedSite]);
  const bucketNames = useMemo(
    () => buckets.map((bucket) => bucket.name),
    [buckets],
  );
  const s3Endpoint = selectedSite?.s3Endpoint ?? "";
  const region = selectedSite?.region ?? "";

  const checkedImageKeys = useMemo(
    () => Object.keys(selectedKeys).filter((k) => selectedKeys[k]),
    [selectedKeys],
  );

  const siteLabel = (site: Site) =>
    site.displayNameJa ?? site.displayName ?? site.displayNameEnUs ?? site.id;

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("ファイルの読み込みに失敗しました。"));
          return;
        }
        const commaIndex = result.indexOf(",");
        if (commaIndex < 0) {
          reject(new Error("ファイルデータ形式が不正です。"));
          return;
        }
        resolve(result.slice(commaIndex + 1));
      };
      reader.onerror = () =>
        reject(new Error("ファイルの読み込みに失敗しました。"));
      reader.readAsDataURL(file);
    });
  }

  async function fetchSitesAndBuckets() {
    setError("");
    setStatus("サイト一覧を取得中...");
    setLoadingSites(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/sites-buckets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, accessTokenSecret }),
      });
      const data = (await response.json()) as SitesResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "サイト取得に失敗しました。");
      }

      const firstSite = data.sites[0]?.id ?? "";
      const firstBucket = data.sites[0]?.buckets?.[0]?.name ?? "";
      setSites(data.sites);
      setSiteId(firstSite);
      setBucket(firstBucket);
      setModalOutputBucket(firstBucket);
      setStatus(`${data.sites.length}件のサイトを取得しました。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStatus("失敗");
    } finally {
      setLoadingSites(false);
    }
  }

  async function issuePreviewUrl(key: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/v1/objects/preview-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessKeyId,
        secretAccessKey,
        siteId,
        region,
        s3Endpoint,
        bucket,
        key,
        expiresSeconds: 300,
      }),
    });

    const data = (await response.json()) as PreviewResponse & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "プレビューURL発行に失敗しました。");
    }
    return data.previewUrl;
  }

  async function preloadPreviewUrls(targetObjects: ImageObject[]) {
    if (targetObjects.length === 0) {
      return;
    }

    const concurrency = 4;
    let index = 0;
    const worker = async () => {
      while (index < targetObjects.length) {
        const current = targetObjects[index];
        index += 1;
        if (!current) {
          continue;
        }

        setPreviewLoadingKeys((prev) => ({ ...prev, [current.key]: true }));
        try {
          const previewUrl = await issuePreviewUrl(current.key);
          setPreviewUrls((prev) => ({ ...prev, [current.key]: previewUrl }));
        } catch {
          // ignore single key error
        } finally {
          setPreviewLoadingKeys((prev) => {
            const next = { ...prev };
            delete next[current.key];
            return next;
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, targetObjects.length) }, () =>
        worker(),
      ),
    );
  }

  async function searchObjects(append = false) {
    setError("");
    setStatus(append ? "画像を追加取得中..." : "画像オブジェクトを検索中...");
    setLoadingObjects(true);
    try {
      const requestContinuationToken = append ? nextContinuationToken : "";
      const response = await fetch(`${API_BASE_URL}/api/v1/objects/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId,
          secretAccessKey,
          siteId,
          region,
          s3Endpoint,
          bucket,
          prefix,
          query,
          maxKeys: 20,
          continuationToken: requestContinuationToken,
        }),
      });
      const data = (await response.json()) as SearchResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "オブジェクト検索に失敗しました。");
      }

      if (append) {
        setObjects((prev) => [...prev, ...data.objects]);
      } else {
        setObjects(data.objects);
        setSelectedKeys({});
        setPreviewUrls({});
        setPreviewLoadingKeys({});
      }
      setIsTruncated(data.isTruncated);
      setNextContinuationToken(data.nextContinuationToken ?? "");
      await preloadPreviewUrls(data.objects);
      setStatus(
        append
          ? `${data.objects.length}件を追加取得しました。`
          : `${data.objects.length}件の画像を取得しました。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStatus("失敗");
    } finally {
      setLoadingObjects(false);
    }
  }

  async function loadMoreObjects() {
    if (!isTruncated || !nextContinuationToken || loadingObjects) {
      return;
    }
    await searchObjects(true);
  }
  /***
  選択を反転するだけ
  ***/
  function toggleChecked(key: string) {
    setSelectedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function openOriginalInNewTab(key: string) {
    try {
      const previewUrl = previewUrls[key] ?? (await issuePreviewUrl(key));
      setPreviewUrls((prev) => ({ ...prev, [key]: previewUrl }));
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "プレビューエラー");
    }
  }

  async function deleteCheckedImages() {
    if (checkedImageKeys.length === 0) {
      return;
    }

    setError("");
    setStatus("チェック画像を削除中...");
    setRunningAIAction(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/objects/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId,
          secretAccessKey,
          siteId,
          region,
          s3Endpoint,
          bucket,
          keys: checkedImageKeys,
        }),
      });

      const data = (await response.json()) as DeleteObjectsResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "削除に失敗しました。");
      }

      const deletedSet = new Set(data.deleted);
      setObjects((prev) => prev.filter((obj) => !deletedSet.has(obj.key)));
      setSelectedKeys({});
      setPreviewUrls((prev) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!deletedSet.has(k)) {
            next[k] = v;
          }
        }
        return next;
      });

      setStatus(`${data.count}件の画像を削除しました。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStatus("失敗");
    } finally {
      setRunningAIAction(false);
    }
  }

  async function uploadImageObject() {
    if (!modalUploadFile) {
      throw new Error("アップロードファイルを選択してください。");
    }

    const uploadKey = modalUploadKey.trim();
    if (!uploadKey) {
      throw new Error("アップロード先キーを入力してください。");
    }

    const dataBase64 = await fileToBase64(modalUploadFile);
    const response = await fetch(`${API_BASE_URL}/api/v1/objects/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessKeyId,
        secretAccessKey,
        siteId,
        region,
        s3Endpoint,
        bucket,
        key: uploadKey,
        dataBase64,
        contentType: modalUploadFile.type,
      }),
    });

    const data = (await response.json()) as UploadObjectResponse & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "画像アップロードに失敗しました。");
    }

    setStatus(`画像を追加しました: ${data.key}`);
    await searchObjects();
  }

  async function renameImageKey() {
    const oldKey = renameTargetKey.trim();
    const newKey = modalNewKey.trim();
    if (!oldKey || !newKey) {
      throw new Error("変更前キーと変更後キーを入力してください。");
    }

    const response = await fetch(`${API_BASE_URL}/api/v1/objects/rename-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessKeyId,
        secretAccessKey,
        siteId,
        region,
        s3Endpoint,
        bucket,
        oldKey,
        newKey,
      }),
    });

    const data = (await response.json()) as RenameObjectKeyResponse & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "キー変更に失敗しました。");
    }

    setStatus(`キーを変更しました: ${data.oldKey} -> ${data.newKey}`);
    await searchObjects();
  }

  function openModal(type: Exclude<ModalType, null>) {
    setModalType(type);
    setModalOutputBucket(bucket || buckets[0]?.name || "");
    setModalUploadFile(null);
    setModalUploadKey("");
    setModalPrompt("");
    setModalSuffix("");
    setModalPrefix("AI生成画像");
    setModalBatch(1);
    setModalScale(4);
    setRenameTargetKey("");
    setModalNewKey("");
  }

  function openRenameModal(key: string) {
    setModalType("rename");
    setRenameTargetKey(key);
    setModalNewKey(key);
  }

  function closeModal() {
    setModalType(null);
    setModalUploadFile(null);
    setRenameTargetKey("");
    setModalNewKey("");
  }

  async function submitModalTask() {
    if (!modalType) {
      return;
    }

    setError("");
    setRunningAIAction(true);
    try {
      if (modalType === "upload") {
        setStatus("画像を追加中...");
        await uploadImageObject();
      }

      if (modalType === "generate") {
        setStatus("画像生成タスクを登録中...");
        const response = await fetch(`${API_BASE_URL}/api/v1/ai/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            accessTokenSecret,
            accessKeyId,
            secretAccessKey,
            siteId,
            s3Endpoint,
            outputBucket: bucket,
            prefix: modalPrefix,
            prompt: modalPrompt,
            batch: modalBatch,
          }),
        });
        const data = (await response.json()) as AITaskCreateResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "生成タスク登録に失敗しました。");
        }
        setStatus(`${data.message} (task: ${data.taskId})`);
      }

      if (modalType === "edit") {
        setStatus("画像編集タスクを登録中...");
        const response = await fetch(`${API_BASE_URL}/api/v1/ai/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            accessTokenSecret,
            accessKeyId,
            secretAccessKey,
            siteId,
            s3Endpoint,
            inputBucket: bucket,
            outputBucket: modalOutputBucket,
            prompt: modalPrompt,
            suffix: modalSuffix,
            imageKeys: checkedImageKeys,
          }),
        });

        const data = (await response.json()) as AITaskCreateResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "編集タスク登録に失敗しました。");
        }
        setStatus(`${data.message} (task: ${data.taskId})`);
      }

      if (modalType === "superres") {
        setStatus("超解像タスクを登録中...");
        const response = await fetch(
          `${API_BASE_URL}/api/v1/ai/super-resolution`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken,
              accessTokenSecret,
              accessKeyId,
              secretAccessKey,
              siteId,
              s3Endpoint,
              inputBucket: bucket,
              outputBucket: modalOutputBucket,
              scale: modalScale,
              suffix: modalSuffix,
              imageKeys: checkedImageKeys,
            }),
          },
        );

        const data = (await response.json()) as AITaskCreateResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "超解像タスク登録に失敗しました。");
        }
        setStatus(`${data.message} (task: ${data.taskId})`);
      }

      if (modalType === "rename") {
        setStatus("キーを変更中...");
        await renameImageKey();
      }

      closeModal();
      await fetchTaggedTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
      setStatus("失敗");
    } finally {
      setRunningAIAction(false);
    }
  }

  async function fetchTaggedTasks() {
    setError("");
    setLoadingTasks(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/ai/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, accessTokenSecret }),
      });
      const data = (await response.json()) as AITaskListResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "タスク取得に失敗しました。");
      }

      setAiTasks(data.tasks);
      setStatus(
        `タグ ${data.tag} のタスクを ${data.tasks.length} 件取得しました。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoadingTasks(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="kicker">DASHBOARD & AI</p>
        <h1>画像管理支援システム for さくらのクラウド</h1>
        <div className="text-white">
          <p>
            さくらのクラウドのオブジェクトストレージ上で画像を管理・操作するためのアプリケーションです。
          </p>
          <p>高火力 DOKによるAI画像生成・加工・超解像にも対応しています。</p>
          <small>
            入力した認証情報はAPI呼び出しにのみ使用され、管理者の基盤に保存されることはありません。安心してご利用ください。
          </small>
        </div>
      </header>

      <section className="card-grid">
        <article className="panel">
          <h2>1. 認証情報</h2>
          <h3>【さくらのクラウド認証情報】</h3>
          <small>
            オブジェクトストレージおよび高火力
            DOKの操作権限を持つAPIキーを入力してください。
          </small>
          <label>
            アクセストークン
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="SAKURA_CLOUD_ACCESS_TOKEN"
            />
          </label>
          <label>
            アクセストークンシークレット
            <input
              type="password"
              value={accessTokenSecret}
              onChange={(e) => setAccessTokenSecret(e.target.value)}
              placeholder="SAKURA_CLOUD_ACCESS_TOKEN_SECRET"
            />
          </label>
          <h3>【オブジェクトストレージ認証情報】</h3>
          <small>
            管理したいバケットにREAD/WRITE権限を持つアクセスキーを入力してください。
          </small>
          <label>
            アクセスキーID
            <input
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="OBJECT_STORAGE_ACCESS_KEY_ID"
            />
          </label>
          <label>
            シークレットアクセスキー
            <input
              type="password"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
              placeholder="OBJECT_STORAGE_SECRET_ACCESS_KEY"
            />
          </label>
          <button onClick={fetchSitesAndBuckets} disabled={loadingSites}>
            {loadingSites ? "取得中..." : "サイト・バケット一覧を取得"}
          </button>
        </article>

        <article className="panel">
          <h2>2. 画像検索</h2>
          <label>
            サイト
            <select
              value={siteId}
              onChange={(e) => {
                const nextSiteId = e.target.value;
                setSiteId(nextSiteId);
                const nextSite = sites.find((site) => site.id === nextSiteId);
                const firstBucket = nextSite?.buckets?.[0]?.name ?? "";
                setBucket(firstBucket);
                setModalOutputBucket(firstBucket);
              }}
            >
              <option value="">選択してください</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {siteLabel(site)} ({site.id})
                </option>
              ))}
            </select>
          </label>
          <label>
            バケット
            <select
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value);
                setModalOutputBucket(e.target.value);
              }}
            >
              <option value="">選択してください</option>
              {bucketNames.map((bucketName) => (
                <option key={bucketName} value={bucketName}>
                  {bucketName}
                </option>
              ))}
            </select>
          </label>
          <label>
            キー接頭辞
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="beautiful/kinokonoyama"
            />
          </label>
          <label>
            検索クエリ
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="android"
            />
          </label>
          <button onClick={() => searchObjects()} disabled={loadingObjects}>
            {loadingObjects ? "検索中..." : "画像を検索"}
          </button>
        </article>
      </section>

      <section className="status-panel">
        <h2>処理状況：</h2>
        <p>{status}</p>
        {error && <p className="error-text">{error}</p>}
        {selectedSite?.bucketFetchError && (
          <p className="error-text">
            バケット一覧取得時に問題が発生しました：{" "}
            {selectedSite.bucketFetchError}
          </p>
        )}
      </section>

      <section className="gallery-panel">
        <div className="gallery-head with-actions">
          <h2>画像一覧 ({objects.length})</h2>
          <div className="action-row">
            <button
              onClick={() => openModal("upload")}
              disabled={runningAIAction}
            >
              画像追加
            </button>
            <button
              onClick={() => openModal("generate")}
              disabled={runningAIAction}
            >
              AI画像生成
            </button>
            <button
              onClick={() => openModal("edit")}
              disabled={checkedImageKeys.length === 0 || runningAIAction}
            >
              選択画像をAI加工
            </button>
            <button
              onClick={() => openModal("superres")}
              disabled={checkedImageKeys.length === 0 || runningAIAction}
            >
              選択画像を超解像
            </button>
            <button
              className="danger"
              onClick={deleteCheckedImages}
              disabled={checkedImageKeys.length === 0 || runningAIAction}
            >
              選択画像を削除
            </button>
          </div>
        </div>

        <p className="meta">選択中: {checkedImageKeys.length}件</p>

        <div className="gallery-grid">
          {objects.map((obj) => {
            const previewUrl = previewUrls[obj.key];
            const checked = Boolean(selectedKeys[obj.key]);
            return (
              <article key={obj.key} className="gallery-item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleChecked(obj.key)}
                />
                <div className="preview-box">
                  <div
                    className="preview-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openOriginalInNewTab(obj.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openOriginalInNewTab(obj.key);
                      }
                    }}
                  >
                    {previewUrl ? (
                      <Image
                        src={previewUrl}
                        alt={obj.key}
                        width={400}
                        height={300}
                        unoptimized
                      />
                    ) : (
                      <span>
                        {previewLoadingKeys[obj.key]
                          ? "読み込み中..."
                          : "プレビューできません。"}
                      </span>
                    )}
                  </div>
                </div>
                <p className="object-key" title={obj.key}>
                  <span className="key-row">
                    <button
                      className="icon-button"
                      onClick={() => openRenameModal(obj.key)}
                      title="キーを編集"
                      disabled={runningAIAction}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M3 17.25V21H6.75L17.8 9.95L14.05 6.2L3 17.25Z"
                          fill="currentColor"
                        />
                        <path
                          d="M20.7 7.05C21.1 6.65 21.1 6 20.7 5.6L18.4 3.3C18 2.9 17.35 2.9 16.95 3.3L15.1 5.15L18.85 8.9L20.7 7.05Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                    <span>{obj.key}</span>
                  </span>
                </p>
                <small className="meta">
                  {obj.size.toLocaleString()} バイト
                </small>
              </article>
            );
          })}
        </div>

        {isTruncated && nextContinuationToken && (
          <div className="center-action">
            <button onClick={loadMoreObjects} disabled={loadingObjects}>
              {loadingObjects ? "追加取得中..." : "さらに表示"}
            </button>
          </div>
        )}
      </section>

      <section className="gallery-panel">
        <div className="gallery-head with-actions">
          <h2>高火力 DOKタスク一覧（最新10件）</h2>
          <button onClick={fetchTaggedTasks} disabled={loadingTasks}>
            {loadingTasks ? "更新中..." : "タスク/アーティファクトを取得"}
          </button>
        </div>

        <table className="task-table">
          <thead>
            <tr>
              <th>タスク名</th>
              <th>ステータス</th>
              <th>作成日時</th>
              <th>成果物</th>
            </tr>
          </thead>
          <tbody>
            {aiTasks.map((task) => (
              <tr key={task.id}>
                <td>{task.name || task.id}</td>
                <td>
                  <strong>{task.status}</strong>
                </td>
                <td>
                  {task.createdAt
                    ? new Date(task.createdAt).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "-"}
                </td>
                <td>
                  {task.artifact?.downloadUrl ? (
                    <a
                      href={task.artifact.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {task.artifact.filename}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {modalType && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {modalType === "upload"
                ? "画像追加"
                : modalType === "generate"
                  ? "AI画像生成"
                  : modalType === "edit"
                    ? "AI画像加工"
                    : modalType === "rename"
                      ? "キー変更"
                      : "超解像"}
            </h2>

            {modalType !== "generate" &&
              modalType !== "upload" &&
              modalType !== "rename" && (
                <p className="meta">対象画像： {checkedImageKeys.length} 件</p>
              )}

            {modalType === "upload" && (
              <>
                <p className="meta">追加先バケット： {bucket || "未選択"}</p>
                <label>
                  アップロードファイル
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setModalUploadFile(file);
                      if (file && !modalUploadKey) {
                        setModalUploadKey(file.name);
                      }
                    }}
                  />
                </label>
                <label>
                  オブジェクトキー
                  <input
                    value={modalUploadKey}
                    onChange={(e) => setModalUploadKey(e.target.value)}
                    placeholder="images/new-image.jpg"
                  />
                </label>
              </>
            )}

            {modalType === "generate" && (
              <>
                <p className="meta">出力先バケット： {bucket || "未選択"}</p>
                <label>
                  ファイル名接頭辞
                  <input
                    value={modalPrefix}
                    onChange={(e) => setModalPrefix(e.target.value)}
                    placeholder="AI生成画像"
                  />
                </label>
                <label>
                  プロンプト
                  <textarea
                    value={modalPrompt}
                    onChange={(e) => setModalPrompt(e.target.value)}
                    placeholder="Android defeats iPhone."
                    rows={3}
                  />
                </label>
                <label>
                  生成枚数 (BATCH)
                  <input
                    type="number"
                    min={1}
                    value={modalBatch}
                    onChange={(e) => setModalBatch(Number(e.target.value) || 1)}
                  />
                </label>
              </>
            )}

            {modalType === "edit" && (
              <>
                <label>
                  出力バケット
                  <select
                    value={modalOutputBucket}
                    onChange={(e) => setModalOutputBucket(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {bucketNames.map((bucketName) => (
                      <option key={bucketName} value={bucketName}>
                        {bucketName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  プロンプト
                  <textarea
                    value={modalPrompt}
                    onChange={(e) => setModalPrompt(e.target.value)}
                    placeholder="add dramatic cinematic lighting"
                    rows={3}
                  />
                </label>
                <label>
                  ファイル名接尾辞
                  <input
                    value={modalSuffix}
                    onChange={(e) => setModalSuffix(e.target.value)}
                    placeholder="edited"
                  />
                </label>
              </>
            )}

            {modalType === "superres" && (
              <>
                <label>
                  出力バケット
                  <select
                    value={modalOutputBucket}
                    onChange={(e) => setModalOutputBucket(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {bucketNames.map((bucketName) => (
                      <option key={bucketName} value={bucketName}>
                        {bucketName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  倍率
                  <input
                    type="number"
                    min={1}
                    value={modalScale}
                    onChange={(e) => setModalScale(Number(e.target.value) || 1)}
                  />
                </label>
                <label>
                  ファイル名接尾辞
                  <input
                    value={modalSuffix}
                    onChange={(e) => setModalSuffix(e.target.value)}
                    placeholder="upscaled"
                  />
                </label>
              </>
            )}

            {modalType === "rename" && (
              <>
                <label>
                  変更前キー
                  <input value={renameTargetKey} readOnly />
                </label>
                <label>
                  変更後キー
                  <input
                    value={modalNewKey}
                    onChange={(e) => setModalNewKey(e.target.value)}
                    placeholder="images/renamed-image.jpg"
                  />
                </label>
              </>
            )}

            <div className="action-row">
              <button onClick={submitModalTask} disabled={runningAIAction}>
                {runningAIAction ? "登録中..." : "実行"}
              </button>
              <button className="ghost" onClick={closeModal}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
