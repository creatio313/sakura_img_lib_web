package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

/***
対クライアント要求・応答
***/
// クライアントのオブジェクト検索要求パラメータを定義する構造体
type searchObjectsRequest struct {
	AccessKeyID       string `json:"accessKeyId"`
	SecretAccessKey   string `json:"secretAccessKey"`
	Region            string `json:"region"`
	S3Endpoint        string `json:"s3Endpoint,omitempty"`
	Bucket            string `json:"bucket"`
	Prefix            string `json:"prefix,omitempty"`
	Query             string `json:"query,omitempty"`
	MaxKeys           int32  `json:"maxKeys,omitempty"`
	ContinuationToken string `json:"continuationToken,omitempty"`
	//SiteIDは、将来的に複数サイト対応やアクセス制御のために利用する可能性があるため、リクエストに含める形で定義しておく。
	SiteID string `json:"siteId"`
}

// クライアントの署名付きURL要求パラメータを定義する構造体
type createPreviewURLRequest struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region"`
	S3Endpoint      string `json:"s3Endpoint,omitempty"`
	Bucket          string `json:"bucket"`
	Key             string `json:"key"`
	ExpiresSeconds  int64  `json:"expiresSeconds,omitempty"`
	//SiteIDは、将来的に複数サイト対応やアクセス制御のために利用する可能性があるため、リクエストに含める形で定義しておく。
	SiteID string `json:"siteId"`
}

type uploadObjectRequest struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region"`
	S3Endpoint      string `json:"s3Endpoint,omitempty"`
	Bucket          string `json:"bucket"`
	Key             string `json:"key"`
	DataBase64      string `json:"dataBase64"`
	ContentType     string `json:"contentType,omitempty"`
	SiteID          string `json:"siteId"`
}

type renameObjectKeyRequest struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	Region          string `json:"region"`
	S3Endpoint      string `json:"s3Endpoint,omitempty"`
	Bucket          string `json:"bucket"`
	OldKey          string `json:"oldKey"`
	NewKey          string `json:"newKey"`
	SiteID          string `json:"siteId"`
}

// クライアントのオブジェクト削除要求パラメータを定義する構造体
type deleteObjectsRequest struct {
	AccessKeyID     string   `json:"accessKeyId"`
	SecretAccessKey string   `json:"secretAccessKey"`
	Region          string   `json:"region"`
	S3Endpoint      string   `json:"s3Endpoint,omitempty"`
	Bucket          string   `json:"bucket"`
	Keys            []string `json:"keys"`
	//SiteIDは、将来的に複数サイト対応やアクセス制御のために利用する可能性があるため、リクエストに含める形で定義しておく。
	SiteID string `json:"siteId"`
}

// 検索結果応答
type searchObjectsResponse struct {
	Bucket                string        `json:"bucket"`
	Prefix                string        `json:"prefix,omitempty"`
	Query                 string        `json:"query,omitempty"`
	Objects               []imageObject `json:"objects"`
	IsTruncated           bool          `json:"isTruncated"`
	NextContinuationToken string        `json:"nextContinuationToken,omitempty"`
	FetchedAt             string        `json:"fetchedAt"`
	SupportedExtensions   []string      `json:"supportedExtensions"`
	EndpointUsed          string        `json:"endpointUsed"`
}

// 個別の画像オブジェクトを表す構造体
type imageObject struct {
	Key          string `json:"key"`
	LastModified string `json:"lastModified,omitempty"`
	Size         int64  `json:"size"`
	ETag         string `json:"etag,omitempty"`
}

// 署名付きURLを含む応答
type createPreviewURLResponse struct {
	Bucket       string `json:"bucket"`
	Key          string `json:"key"`
	PreviewURL   string `json:"previewUrl"`
	ExpiresAt    string `json:"expiresAt"`
	ContentType  string `json:"contentType"`
	EndpointUsed string `json:"endpointUsed"`
}

type uploadObjectResponse struct {
	Bucket       string `json:"bucket"`
	Key          string `json:"key"`
	Size         int    `json:"size"`
	ContentType  string `json:"contentType"`
	EndpointUsed string `json:"endpointUsed"`
}

type renameObjectKeyResponse struct {
	Bucket       string `json:"bucket"`
	OldKey       string `json:"oldKey"`
	NewKey       string `json:"newKey"`
	EndpointUsed string `json:"endpointUsed"`
}

// S3互換APIを利用して指定されたバケット内の画像オブジェクトを検索して返却する。
func (s *apiServer) handleSearchObjects(w http.ResponseWriter, r *http.Request) {
	/***
	リクエストの検証
	***/
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req searchObjectsRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// 必須パラメータのチェック
	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセスキーIDとシークレットアクセスキーは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Region) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "リージョンは必須項目です。"})
		return
	}
	if req.Bucket == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "バケット名は必須項目です。"})
		return
	}

	// 最大返却数の範囲チェックとデフォルト値設定
	if req.MaxKeys <= 0 || req.MaxKeys > 1000 {
		req.MaxKeys = 1000
	}

	// S3クライアントの初期化
	ctx := r.Context()
	s3Client, endpoint, err := newS3Client(ctx, req.AccessKeyID, req.SecretAccessKey, req.Region, req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// S3互換APIからオブジェクト一覧を取得
	out, err := s3Client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:            aws.String(req.Bucket),
		Prefix:            aws.String(req.Prefix),
		MaxKeys:           aws.Int32(req.MaxKeys),
		ContinuationToken: optionalStringPtr(req.ContinuationToken),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIからオブジェクトの一覧取得に失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	// 検索クエリの前処理（小文字変換とトリム）
	query := strings.ToLower(strings.TrimSpace(req.Query))
	// 返却するオブジェクト変数
	objects := make([]imageObject, 0, len(out.Contents))

	// 取得したオブジェクトをフィルタリング
	for _, obj := range out.Contents {
		if obj.Key == nil {
			continue
		}

		key := *obj.Key
		// 対応する画像形式のみを抽出
		if !isSupportedImage(key) {
			continue
		}
		// クエリによる絞り込み（部分一致）
		if query != "" && !strings.Contains(strings.ToLower(key), query) {
			continue
		}

		/***
		imageObject構造体にデータを詰め直す
		ChecksumAlgorithm, ChecksumType, Owner, RestoreStatus, StorageClassは不要であるため入れない。
		なお、ChecksumAlgorithm, ChecksumType, RestoreStatusは基本的に空欄である。
		***/
		image := imageObject{
			Key:  key,
			Size: aws.ToInt64(obj.Size),
			ETag: aws.ToString(obj.ETag),
		}
		if obj.LastModified != nil {
			image.LastModified = obj.LastModified.UTC().Format(time.RFC3339)
		}
		objects = append(objects, image)
	}

	// レスポンスの構築
	resp := searchObjectsResponse{
		Bucket:                req.Bucket,
		Prefix:                req.Prefix,
		Query:                 req.Query,
		Objects:               objects,
		IsTruncated:           aws.ToBool(out.IsTruncated),
		NextContinuationToken: aws.ToString(out.NextContinuationToken),
		FetchedAt:             time.Now().UTC().Format(time.RFC3339),
		SupportedExtensions:   []string{".jpg", ".jpeg", ".png", ".gif", ".webp"},
		EndpointUsed:          endpoint,
	}

	writeJSON(w, http.StatusOK, resp)
}

// S3互換APIを利用して画像オブジェクトをアップロードするハンドラ関数。
func (s *apiServer) handleUploadObject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req uploadObjectRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセスキーIDとシークレットアクセスキーは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Region) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "リージョンは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Bucket) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "バケット名は必須項目です。"})
		return
	}

	key := strings.TrimSpace(req.Key)
	if key == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "オブジェクトキーは必須項目です。"})
		return
	}
	if !isSupportedImage(key) {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "サポートされている画像形式である必要があります（.jpg, .jpeg, .png, .gif, .webp）。"})
		return
	}

	payload := strings.TrimSpace(req.DataBase64)
	if payload == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アップロードデータが指定されていません。"})
		return
	}

	rawData, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アップロードデータのデコードに失敗しました。"})
		return
	}

	contentType := strings.TrimSpace(req.ContentType)
	if contentType == "" {
		contentType = detectImageContentType(key)
	}

	ctx := r.Context()
	s3Client, endpoint, err := newS3Client(ctx, req.AccessKeyID, req.SecretAccessKey, req.Region, req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(req.Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(rawData),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIでのオブジェクトアップロードに失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	writeJSON(w, http.StatusOK, uploadObjectResponse{
		Bucket:       req.Bucket,
		Key:          key,
		Size:         len(rawData),
		ContentType:  contentType,
		EndpointUsed: endpoint,
	})
}

// S3互換APIを利用してオブジェクトキーを変更するハンドラ関数。
func (s *apiServer) handleRenameObjectKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req renameObjectKeyRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセスキーIDとシークレットアクセスキーは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Region) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "リージョンは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Bucket) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "バケット名は必須項目です。"})
		return
	}

	oldKey := strings.TrimSpace(req.OldKey)
	newKey := strings.TrimSpace(req.NewKey)
	if oldKey == "" || newKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "変更前キーと変更後キーは必須項目です。"})
		return
	}
	if oldKey == newKey {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "変更前キーと変更後キーが同じです。"})
		return
	}
	if !isSupportedImage(oldKey) || !isSupportedImage(newKey) {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "サポートされている画像形式である必要があります（.jpg, .jpeg, .png, .gif, .webp）。"})
		return
	}

	ctx := r.Context()
	s3Client, endpoint, err := newS3Client(ctx, req.AccessKeyID, req.SecretAccessKey, req.Region, req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	copySource := buildS3CopySource(req.Bucket, oldKey)
	_, err = s3Client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(req.Bucket),
		Key:        aws.String(newKey),
		CopySource: aws.String(copySource),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIでのオブジェクト複製に失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	_, err = s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(req.Bucket),
		Key:    aws.String(oldKey),
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIでの旧キー削除に失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	writeJSON(w, http.StatusOK, renameObjectKeyResponse{
		Bucket:       req.Bucket,
		OldKey:       oldKey,
		NewKey:       newKey,
		EndpointUsed: endpoint,
	})
}

// S3互換APIを利用して指定された画像オブジェクトのプレビューURLを生成するハンドラ関数。
func (s *apiServer) handleCreatePreviewURL(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req createPreviewURLRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// 必須パラメータのチェック
	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセスキーIDとシークレットアクセスキーは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Region) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "リージョンは必須項目です。。"})
		return
	}
	if req.Bucket == "" || req.Key == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "バケット名とオブジェクトキーは必須項目です。"})
		return
	}
	// 対応している画像かどうかのチェック
	if !isSupportedImage(req.Key) {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "サポートされている画像形式である必要があります（.jpg, .jpeg, .png, .gif, .webp）。"})
		return
	}

	// 有効期限の範囲チェックとデフォルト値設定（5分〜1時間）
	expires := req.ExpiresSeconds
	if expires <= 0 {
		expires = 300
	}
	if expires > 3600 {
		expires = 3600
	}

	// S3クライアントの初期化
	ctx := r.Context()
	s3Client, endpoint, err := newS3Client(ctx, req.AccessKeyID, req.SecretAccessKey, req.Region, req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// 署名付きURLの生成
	presigner := s3.NewPresignClient(s3Client)
	presigned, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(req.Bucket),
		Key:    aws.String(req.Key),
	}, s3.WithPresignExpires(time.Duration(expires)*time.Second))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIでのプレビューURLの作成に失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	// レスポンスの構築
	resp := createPreviewURLResponse{
		EndpointUsed: endpoint,
		Bucket:       req.Bucket,
		Key:          req.Key,
		PreviewURL:   presigned.URL,
		ExpiresAt:    time.Now().UTC().Add(time.Duration(expires) * time.Second).Format(time.RFC3339),
		ContentType:  detectImageContentType(req.Key),
	}
	writeJSON(w, http.StatusOK, resp)
}

// S3互換APIを利用して指定された複数の画像オブジェクトを削除するハンドラ関数。
func (s *apiServer) handleDeleteObjects(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req deleteObjectsRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// 必須パラメータのチェック
	if req.AccessKeyID == "" || req.SecretAccessKey == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセスキーIDとシークレットアクセスキーは必須項目です。"})
		return
	}
	if strings.TrimSpace(req.Region) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "リージョンは必須項目です。。"})
		return
	}
	if strings.TrimSpace(req.Bucket) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "バケット名は必須項目です。"})
		return
	}

	// 削除対象キーの正規化と検証
	keys, err := normalizeImageKeys(req.Keys)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// S3クライアントの初期化
	ctx := r.Context()
	s3Client, endpoint, err := newS3Client(ctx, req.AccessKeyID, req.SecretAccessKey, req.Region, req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// 削除対象オブジェクト識別子の構築
	objects := make([]s3types.ObjectIdentifier, 0, len(keys))
	for _, key := range keys {
		objects = append(objects, s3types.ObjectIdentifier{Key: aws.String(key)})
	}

	// S3互換APIを使用してオブジェクトを削除
	result, err := s3Client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(req.Bucket),
		Delete: &s3types.Delete{Objects: objects, Quiet: aws.Bool(false)},
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: fmt.Sprintf("S3互換APIでのオブジェクト削除に失敗しました。エンドポイント %s： %v", endpoint, err)})
		return
	}

	// 削除されたオブジェクトキーのリストを作成
	deleted := make([]string, 0, len(result.Deleted))
	for _, d := range result.Deleted {
		deleted = append(deleted, aws.ToString(d.Key))
	}

	// レスポンスの構築
	writeJSON(w, http.StatusOK, map[string]any{
		"bucket":  req.Bucket,
		"deleted": deleted,
		"count":   len(deleted),
	})
}

// 指定された認証情報とエンドポイントを使用してS3クライアントを初期化する。
func newS3Client(ctx context.Context, accessKeyID, secretAccessKey, region, explicitEndpoint string) (*s3.Client, string, error) {
	// エンドポイントURLの解決
	endpoint, err := resolveS3Endpoint(explicitEndpoint)
	if err != nil {
		return nil, "", err
	}
	if strings.TrimSpace(region) == "" {
		return nil, "", fmt.Errorf("リージョンは必須項目です。")
	}

	// AWS設定のロード
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(strings.TrimSpace(region)),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")),
	)
	if err != nil {
		return nil, "", fmt.Errorf("AWSコンフィグのロードに失敗しました： %w", err)
	}

	// S3クライアントの作成（パススタイルではなくDNSスタイルを使用）
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = false
		o.BaseEndpoint = aws.String(endpoint)
	})

	return client, endpoint, nil
}

// optionalStringPtr は、文字列が空でない場合にのみポインタを返すユーティリティ関数。
// AWS SDKのオプショナルパラメータに使用される。
func optionalStringPtr(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return aws.String(v)
}

// CopyObjectのcopy source指定形式に合わせて、バケット名とキーをURLエンコードして連結する。
func buildS3CopySource(bucket, key string) string {
	parts := strings.Split(key, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	return bucket + "/" + strings.Join(parts, "/")
}
