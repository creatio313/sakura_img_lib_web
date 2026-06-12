package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path"
	"strings"
)

// 環境変数がない場合に許可するオリジン。開発用のローカルNext.jsリンク。
const defaultAllowedOrigin = "http://localhost:3000"

var imageExtensions = map[string]struct{}{
	".jpg":  {},
	".jpeg": {},
	".png":  {},
	".gif":  {},
	".webp": {},
}

type errorResponse struct {
	Error string `json:"error"`
}

/***
CORS制御
***/
// 環境変数から許可するオリジンをパースする。カンマ区切りで複数指定可能。指定がない場合は defaultAllowedOrigin を返す。
func parseAllowedOrigins(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{defaultAllowedOrigin}
	}

	parts := strings.Split(raw, ",")
	//結果格納用配列
	origins := make([]string, 0, len(parts))
	//重複チェック用配列
	seen := make(map[string]struct{}, len(parts))
	//前後の空白をトリムして重複を排除しながら配列に格納
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if _, ok := seen[origin]; ok {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}

	if len(origins) == 0 {
		return []string{defaultAllowedOrigin}
	}

	return origins
}

// クロスオリジン許可。
func withCORS(next http.Handler, allowedOrigins []string) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if _, ok := allowed[origin]; !ok {
				writeJSON(w, http.StatusForbidden, errorResponse{Error: "クロスオリジンリクエストは許可されていません。"})
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}

		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

/*
**
JSONのみ受け付けるミドルウェア。POSTリクエストのContent-Typeがapplication/jsonでない場合は400 Bad Requestを返す。
**
*/
func withJSONOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			contentType := r.Header.Get("Content-Type")
			if !strings.HasPrefix(contentType, "application/json") {
				writeJSON(w, http.StatusUnsupportedMediaType, errorResponse{Error: "Content-Typeはapplication/jsonである必要があります。"})
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

/*
**
HTTPリクエストのメソッドが許可されていない場合のレスポンス
**
*/
func writeMethodNotAllowed(w http.ResponseWriter) {
	writeJSON(w, http.StatusMethodNotAllowed, errorResponse{Error: "許可されていないHTTPメソッドです。"})
}

/*
**
JSONリクエストのデコードとバリデーション
**
*/
func decodeJSONBody(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	// 受け取った方でJSONを構造体にデコードする。エラーがあればクライアントに400 Bad Requestで返す。
	if err := dec.Decode(dst); err != nil {
		return fmt.Errorf("規定外のJSONです: %w", err)
	}

	if dec.More() {
		return errors.New("規定外のJSONです: 複数のJSON値は許可されていません")
	}
	return nil
}

// JSON応答作成のヘルパー関数
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("JSON応答のエンコードに失敗しました： %v", err)
	}
}
/***
S3エンドポイントの正規化と検証
***/
// URLスキームがないS3エンドポイントにHTTPSを補完する。
func normalizeS3Endpoint(endpoint string) string {
	normalized := strings.TrimSpace(endpoint)
	if normalized == "" {
		return ""
	}
	if strings.Contains(normalized, "://") {
		return normalized
	}
	return "https://" + normalized
}

// 明示的に与えられたS3エンドポイントを正規化して返す。
func resolveS3Endpoint(explicitEndpoint string) (string, error) {
	endpoint := normalizeS3Endpoint(explicitEndpoint)
	if endpoint == "" {
		return "", errors.New("S3エンドポイントは必須項目です。")
	}
	return endpoint, nil
}
/*
**
画像キーの正規化。空白をトリムし、サポートされていない拡張子を除外し、重複を排除する。結果が空の場合はエラー。
**
*/
func normalizeImageKeys(keys []string) ([]string, error) {
	// 画像識別子が指定されていない場合はエラー
	if len(keys) == 0 {
		return nil, errors.New("画像識別子が指定されていません。")
	}
	// 重複確認用の配列
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(keys))
	for _, k := range keys {
		key := strings.TrimSpace(k)
		if key == "" {
			continue
		}
		if !isSupportedImage(key) {
			return nil, fmt.Errorf("サポートされていない画像拡張子です: %s", key)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	// 有効な画像識別子が1件も存在しない場合はエラー
	if len(normalized) == 0 {
		return nil, errors.New("有効な画像識別子が選択されていません。")
	}
	return normalized, nil
}
/***
拡張子対応
***/
// 対応している画像拡張子かどうかを判定する。
func isSupportedImage(key string) bool {
	ext := strings.ToLower(path.Ext(key))
	_, ok := imageExtensions[ext]
	return ok
}
// プレビューURLを作成する際のコンテンツタイプを定義
func detectImageContentType(key string) string {
	switch strings.ToLower(path.Ext(key)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}