import { required } from "./auth";

export type StorageCredential = { accessKeyId: string; secretAccessKey: string };

export function storageCredential(siteId: string): StorageCredential {
  const siteCode = siteId.replace(/-/g, "_").toUpperCase();
  const prefix = `OBJECT_STORAGE_${siteCode}`;

  return {
    accessKeyId: required(`${prefix}_ACCESS_KEY_ID`),
    secretAccessKey: required(`${prefix}_SECRET_ACCESS_KEY`),
  };
}

export function s3EndpointUrl(endpoint: string) {
  return endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
}
