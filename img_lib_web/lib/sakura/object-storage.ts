import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ImageListResult, Site } from "@/types/media";
import { objectStorageApi, sakuraFetch } from "./auth";
import { s3EndpointUrl, storageCredential } from "./storage-config";

const imageExtensions = /\.(jpe?g|png|gif|webp)$/i;

type ObjectStorageCluster = {
  id: string;
  region: string;
  display_name?: string;
  display_name_ja?: string;
  display_name_en_us?: string;
  s3_endpoint: string;
};

function s3Client(site: Site) {
  return new S3Client({
    region: site.region,
    endpoint: s3EndpointUrl(site.s3Endpoint),
    forcePathStyle: false,
    credentials: storageCredential(site.id),
  });
}

function assertImageKey(key: string) {
  if (!imageExtensions.test(key)) throw new Error("対応画像形式は JPG、PNG、GIF、WebP です。");
}

// サイトとバケットを取得する。
export async function listSites(): Promise<Site[]> {
  const clusters = (await (await sakuraFetch(`${objectStorageApi}/fed/v1/clusters`)).json()) as { data: ObjectStorageCluster[] };
  return Promise.all(clusters.data.map(async (cluster) => {
    const site: Site = {
      id: cluster.id,
      region: cluster.region,
      displayName: cluster.display_name,
      displayNameJa: cluster.display_name_ja,
      displayNameEnUs: cluster.display_name_en_us,
      s3Endpoint: cluster.s3_endpoint,
      buckets: [],
    };
    try {
      const result = (await (await sakuraFetch(`${objectStorageApi}/${cluster.id}/v2/buckets`)).json()) as { data: { name: string }[] };
      return { ...site, buckets: result.data };
    } catch (error) {
      return { ...site, bucketFetchError: error instanceof Error ? error.message : "バケット一覧を取得できませんでした。" };
    }
  }));
}

export function assertSiteBucket(site: Site, bucket: string, message = "選択された出力バケットが見つかりません。") {
  if (!site.buckets.some((item) => item.name === bucket)) throw new Error(message);
}

export function selectedSite(sites: Site[], siteId: string, bucket: string) {
  const site = sites.find((item) => item.id === siteId);
  if (!site) throw new Error("選択されたサイトが見つかりません。");
  assertSiteBucket(site, bucket, "選択されたバケットが見つかりません。");
  return site;
}

// 画像一覧取得
export async function listImages(site: Site, bucket: string, prefix: string, continuationToken?: string): Promise<ImageListResult> {
  const result = await s3Client(site).send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 50, ContinuationToken: continuationToken }));
  return {
    objects: (result.Contents ?? []).filter((item) => item.Key && imageExtensions.test(item.Key)).map((item) => ({ key: item.Key!, size: Number(item.Size ?? 0) })),
    isTruncated: result.IsTruncated ?? false,
    nextContinuationToken: result.NextContinuationToken,
  };
}

// 署名付きURL取得
export async function previewImage(site: Site, bucket: string, key: string) {
  assertImageKey(key);
  return getSignedUrl(s3Client(site), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
}

// 画像アップロード
export async function uploadImage(site: Site, bucket: string, key: string, data: string, contentType?: string) {
  assertImageKey(key);
  await s3Client(site).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from(data, "base64"), ContentType: contentType }));
}

// 画像削除
export async function deleteImages(site: Site, bucket: string, keys: string[]) {
  if (keys.length === 0) throw new Error("削除する画像を選択してください。");
  keys.forEach(assertImageKey);
  const result = await s3Client(site).send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  return {
    deleted: (result.Deleted ?? []).flatMap((item) => item.Key ? [item.Key] : []),
    errors: (result.Errors ?? []).map((item) => ({ key: item.Key, code: item.Code, message: item.Message })),
  };
}

// 画像ファイルのキー変更
export async function renameImage(site: Site, bucket: string, oldKey: string, newKey: string) {
  assertImageKey(oldKey);
  assertImageKey(newKey);
  const client = s3Client(site);
  await client.send(new CopyObjectCommand({ Bucket: bucket, Key: newKey, CopySource: `${bucket}/${oldKey.split("/").map(encodeURIComponent).join("/")}` }));
  await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: [{ Key: oldKey }] } }));
}

export { s3EndpointUrl, storageCredential } from "./storage-config";
