package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultReadTimeout  = 15 * time.Second
	defaultWriteTimeout = 30 * time.Second
	defaultIdleTimeout  = 60 * time.Second
)

type apiServer struct {
	httpClient *http.Client
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &apiServer{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}

	//許可する呼び出し元オリジンを環境変数から取得（カンマ区切り）。指定がない場合はローカル開発用に http://localhost:3000 を許可。
	allowedOrigins := parseAllowedOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	log.Printf("呼び出し元のオリジンとして%sを許可します。", strings.Join(allowedOrigins, ","))

	mux := http.NewServeMux()
	//死活監視
	mux.HandleFunc("/healthz", srv.handleHealth)
	//オブジェクトストレージAPIプロキシ
	mux.HandleFunc("/api/v1/sites-buckets", srv.handleListSitesAndBuckets)
	//S3互換APIプロキシ
	mux.HandleFunc("/api/v1/objects/search", srv.handleSearchObjects)
	mux.HandleFunc("/api/v1/objects/preview-url", srv.handleCreatePreviewURL)
	mux.HandleFunc("/api/v1/objects/delete", srv.handleDeleteObjects)
	//高火力 DOKおよびAI関連APIプロキシ
	mux.HandleFunc("/api/v1/ai/tasks", srv.handleListTaggedAITasks)
	mux.HandleFunc("/api/v1/ai/generate", srv.handleCreateAIGenerationTask)
	mux.HandleFunc("/api/v1/ai/edit", srv.handleCreateAIEditTask)
	mux.HandleFunc("/api/v1/ai/super-resolution", srv.handleCreateAISuperResolutionTask)

	handler := withCORS(withJSONOnly(mux), allowedOrigins)

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: defaultReadTimeout,
		ReadTimeout:       defaultReadTimeout,
		WriteTimeout:      defaultWriteTimeout,
		IdleTimeout:       defaultIdleTimeout,
	}

	log.Printf("ポート%sでAPIサーバを起動しました。", port)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("サーバの起動に失敗しました：%v", err)
	}
}

// 死活監視用
func (s *apiServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
