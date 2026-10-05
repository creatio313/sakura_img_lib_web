import { createSign } from "node:crypto";

const tokenApi = "https://secure.sakura.ad.jp/cloud/api/iam/1.0/service-principals/oauth2/token";

export const objectStorageApi = "https://secure.sakura.ad.jp/cloud/zone/is1a/api/objectstorage/1.0";
export const dokApi = "https://secure.sakura.ad.jp/cloud/zone/is1a/api/managed-container/1.0";

type TokenResponse = {
  access_token: string;
  token_type: string;
  token_expired_at: string;
  expires_in: number;
};

type TokenCache = {
  access_token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | undefined;

export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`サーバ環境変数 ${name} が設定されていません。`);
  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.access_token;

  // サービスプリンシパルのアクセストークンを取得するためのボディ生成
  const resourceId = required("SAKURA_SERVICE_PRINCIPAL_RESOURCE_ID");
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: required("SAKURA_SERVICE_PRINCIPAL_KID"), typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(JSON.stringify({ aud: tokenApi, exp: now + 300, iat: now, iss: resourceId, sub: resourceId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const configuredPrivateKey = required("SAKURA_SERVICE_PRINCIPAL_PRIVATE_KEY");
  const unquotedPrivateKey = configuredPrivateKey.replace(/^(['"])([\s\S]*)\1$/, "$2");
  const privateKey = unquotedPrivateKey.replace(/\\n/g, "\n");
  const assertion = `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;

  // アクセストークン要求
  const response = await fetch(tokenApi, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const data = (await response.json()) as Partial<TokenResponse>;
  if (!response.ok || !data.access_token || !data.token_expired_at || typeof data.expires_in !== "number") {
    throw new Error("サービスプリンシパルのアクセストークン発行に失敗しました。");
  }
  // アクセストークンをキャッシュに保存
  const expiresAt = Date.parse(data.token_expired_at);
  tokenCache = { access_token: data.access_token, expiresAt: Number.isNaN(expiresAt) ? Date.now() + data.expires_in * 1000 : expiresAt };
  // アクセストークンを返却
  return tokenCache.access_token;
}

export async function sakuraFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "X-Requested-With": "XMLHttpRequest", ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`さくらのクラウド API が ${response.status} を返却しました。${detail ? ` ${detail}` : ""}`);
  }
  return response;
}
