export type Bucket = { name: string };

export type Site = {
    // サイト一覧取得API
    /**
     * api_zone
     * control_panel_url
     * display_order
     * endpoint_base
     * s3_endpoint_for_control_panel
     * storage_zone
     * plan_family
     * は入れていないが取れる。
     */
    id: string;
    region: string;
    displayName?: string;
    displayNameJa?: string;
    displayNameEnUs?: string;
    s3Endpoint: string;
    // バケット一覧取得API
    buckets: Bucket[];
    bucketFetchError?: string;
};

export type Task = {
    // タスク一覧取得API
    /**
     * https://manual.sakura.ad.jp/koukaryoku-dok-api/spec.html
     * 他に取れる項目はここで参照すること。
     */
    id: string;
    name: string;
    created_at?: string;
    status: string;
    error_message?: string;
};

export type ImageItem = {
    key: string;
    size: number;
};

export type ImageListResult = {
  objects: ImageItem[];
  isTruncated: boolean;
  nextContinuationToken?: string;
};
