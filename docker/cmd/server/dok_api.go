package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// 定数
const (
	sakuraDOKAPIBase      = "https://secure.sakura.ad.jp/cloud/zone/is1a/api/managed-container/1.0"
	dokPlanH100           = "h100-80gb"
	imageManagerTag       = "img_lib_generated"
	envDOKFluxImage       = "DOK_FLUX_IMAGE"
	envDOKRealESRGANImage = "DOK_REALESRGAN_IMAGE"
)

/*
**
クライアントから受ける要求の構造体
**
*/
type createAIGenerationTaskRequest struct {
	aiCredentialRequest
	Batch        int    `json:"batch"`
	OutputBucket string `json:"outputBucket"`
	Prefix       string `json:"prefix"`
	Prompt       string `json:"prompt"`
}

type createAIEditTaskRequest struct {
	aiCredentialRequest
	ImageKeys    []string `json:"imageKeys"`
	InputBucket  string   `json:"inputBucket"`
	OutputBucket string   `json:"outputBucket"`
	Prompt       string   `json:"prompt"`
	Suffix       string   `json:"suffix"`
}

type createAISuperResolutionTaskRequest struct {
	aiCredentialRequest
	ImageKeys    []string `json:"imageKeys"`
	InputBucket  string   `json:"inputBucket"`
	OutputBucket string   `json:"outputBucket"`
	Scale        int      `json:"scale"`
	Suffix       string   `json:"suffix"`
}

type aiCredentialRequest struct {
	AccessKeyID       string `json:"accessKeyId"`
	AccessToken       string `json:"accessToken"`
	AccessTokenSecret string `json:"accessTokenSecret"`
	SecretAccessKey   string `json:"secretAccessKey"`
	S3Endpoint        string `json:"s3Endpoint,omitempty"`
	//念のため保持しているが消すのもあり
	SiteID string `json:"siteId"`
}

type listAITasksRequest struct {
	AccessToken       string `json:"accessToken"`
	AccessTokenSecret string `json:"accessTokenSecret"`
}

/*
**
クライアントに返すレスポンス
**
*/
type aiTaskCreateResponse struct {
	TaskID                string            `json:"taskId"`
	Name                  string            `json:"name"`
	CreatedAt             string            `json:"createdAt,omitempty"`
	UpdatedAt             string            `json:"updatedAt,omitempty"`
	CanceledAt            *string           `json:"canceledAt,omitempty"`
	HTTPURI               *string           `json:"httpUri,omitempty"`
	Containers            []aiTaskContainer `json:"containers"`
	Status                string            `json:"status"`
	Tags                  []string          `json:"tags"`
	ErrorMessage          string            `json:"errorMessage,omitempty"`
	Artifact              *aiTaskArtifact   `json:"artifact,omitempty"`
	ExecutionTimeLimitSec *int              `json:"executionTimeLimitSec,omitempty"`
	// Messageだけあればよい？
	Operation string `json:"operation"`
	Message   string `json:"message"`
}

type aiTaskListResponse struct {
	Tag   string       `json:"tag"`
	Tasks []aiTaskItem `json:"tasks"`
}

/*
高火力 DOKタスク登録APIのリクエスト構造体。
*/
type dokCreateTaskRequest struct {
	Name       string                 `json:"name"`
	Containers []dokContainerCreation `json:"containers"`
	Tags       []string               `json:"tags"`
}

type dokContainerCreation struct {
	Image       string            `json:"image"`
	Command     []string          `json:"command"`
	Entrypoint  []string          `json:"entrypoint"`
	Environment map[string]string `json:"environment,omitempty"`
	Plan        string            `json:"plan"`
}

/***
高火力 DOKAPIレスポンス構造体
***/
// 高火力 DOKのタスク一覧取得APIのレスポンス構造体。
type dokTaskListResponse struct {
	Meta    dokPageMeta  `json:"meta"`
	Results []dokTaskRaw `json:"results"`
}
type dokPageMeta struct {
	Page       int     `json:"page"`
	PageSize   int     `json:"page_size"`
	TotalPages int     `json:"total_pages"`
	Count      int     `json:"count"`
	Next       *string `json:"next"`
	Previous   *string `json:"previous"`
}

// 高火力 DOKのアーティファクトダウンロードURL取得APIのレスポンス構造体。
type dokURLResponse struct {
	URL string `json:"url"`
}

/***
高火力　DOK汎用構造体
***/
// 高火力 DOKのタスク構造体。
type dokTask = aiTaskItem
type aiTaskItem struct {
	ID                    string            `json:"id"`
	Name                  string            `json:"name"`
	CreatedAt             string            `json:"createdAt,omitempty"`
	UpdatedAt             string            `json:"updatedAt,omitempty"`
	CanceledAt            *string           `json:"canceledAt,omitempty"`
	HTTPURI               *string           `json:"httpUri,omitempty"`
	Containers            []aiTaskContainer `json:"containers"`
	Status                string            `json:"status"`
	Tags                  []string          `json:"tags"`
	ErrorMessage          string            `json:"errorMessage,omitempty"`
	Artifact              *aiTaskArtifact   `json:"artifact,omitempty"`
	ExecutionTimeLimitSec *int              `json:"executionTimeLimitSec,omitempty"`
}

// クライアント返却モデルとDOK内部モデルを統一する。
type dokContainer = aiTaskContainer
type aiTaskContainer struct {
	Index            int               `json:"index"`
	Image            string            `json:"image"`
	Registry         *string           `json:"registry,omitempty"`
	Command          []string          `json:"command"`
	Entrypoint       []string          `json:"entrypoint"`
	Environment      map[string]string `json:"environment,omitempty"`
	HTTP             *dokContainerHTTP `json:"http,omitempty"`
	SSH              *dokContainerSSH  `json:"ssh,omitempty"`
	Plan             string            `json:"plan"`
	ExitCode         *int              `json:"exitCode,omitempty"`
	ExecutionSeconds *int              `json:"executionSeconds,omitempty"`
	StartAt          *string           `json:"startAt,omitempty"`
	StopAt           *string           `json:"stopAt,omitempty"`
}

// 高火力 DOKの成果物構造体
type dokArtifact = aiTaskArtifact
type aiTaskArtifact struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	Filename  string `json:"filename"`
	SizeBytes int64  `json:"sizeBytes"`
	// Artifact応答に含まれるわけではないが、別API呼び出しで追加するため保持している
	DownloadURL string `json:"downloadUrl,omitempty"`
}

// DOK APIのsnake_caseレスポンスを受けるためのRaw構造体。
type dokTaskRaw struct {
	ID                    string            `json:"id"`
	Name                  string            `json:"name"`
	CreatedAt             string            `json:"created_at"`
	UpdatedAt             string            `json:"updated_at"`
	CanceledAt            *string           `json:"canceled_at"`
	HTTPURI               *string           `json:"http_uri"`
	Containers            []dokContainerRaw `json:"containers"`
	Status                string            `json:"status"`
	Tags                  []string          `json:"tags"`
	ErrorMessage          string            `json:"error_message"`
	Artifact              *dokArtifactRaw   `json:"artifact"`
	ExecutionTimeLimitSec *int              `json:"execution_time_limit_sec"`
}

type dokContainerRaw struct {
	Index            int               `json:"index"`
	Image            string            `json:"image"`
	Registry         *string           `json:"registry"`
	Command          []string          `json:"command"`
	Entrypoint       []string          `json:"entrypoint"`
	Environment      map[string]string `json:"environment"`
	HTTP             *dokContainerHTTP `json:"http"`
	SSH              *dokContainerSSH  `json:"ssh"`
	Plan             string            `json:"plan"`
	ExitCode         *int              `json:"exit_code"`
	ExecutionSeconds *int              `json:"execution_seconds"`
	StartAt          *string           `json:"start_at"`
	StopAt           *string           `json:"stop_at"`
}

type dokArtifactRaw struct {
	ID        string `json:"id"`
	Task      string `json:"task"`
	Filename  string `json:"filename"`
	SizeBytes int64  `json:"size_bytes"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type dokContainerHTTP struct {
	Port int    `json:"port"`
	Path string `json:"path"`
}

type dokContainerSSH struct {
	Shell    string  `json:"shell"`
	HostName *string `json:"host_name"`
	Port     int     `json:"port"`
}

/*
AI画像生成タスク
*/
func (s *apiServer) handleCreateAIGenerationTask(w http.ResponseWriter, r *http.Request) {
	/***
	リクエストのバリデーション
	***/
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req createAIGenerationTaskRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if strings.TrimSpace(req.OutputBucket) == "" || strings.TrimSpace(req.Prefix) == "" || strings.TrimSpace(req.Prompt) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "出力先バケット、接頭辞、プロンプトは必須項目です。"})
		return
	}
	if req.Batch <= 0 {
		req.Batch = 1
	}

	// プロンプトの構成
	promptPayload, err := json.Marshal([][]string{{req.Prefix, req.Prompt}})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: fmt.Sprintf("プロンプトの構成に失敗しました： %v", err)})
		return
	}

	// 認証情報のバリデーション
	if err := validateAICredentials(req.aiCredentialRequest); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	endpoint, err := resolveS3Endpoint(req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// コンテナ格納先の環境変数を取得
	fluxImage := strings.TrimSpace(os.Getenv(envDOKFluxImage))
	if fluxImage == "" {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "画像生成AIのコンテナイメージ格納先がサーバに設定されていません。"})
		return
	}

	// 高火力 DOKタスクの登録
	task, err := s.createDOKTask(r.Context(), req.AccessToken, req.AccessTokenSecret, dokCreateTaskRequest{
		Name: fmt.Sprintf("画像生成タスク-%d", time.Now().Unix()),
		Containers: []dokContainerCreation{{
			Image:      fluxImage,
			Command:    []string{},
			Entrypoint: []string{"/docker-entrypoint.sh"},
			Plan:       dokPlanH100,
			Environment: map[string]string{
				"BATCH":          strconv.Itoa(req.Batch),
				"PROMPT":         string(promptPayload),
				"OBJST_BUCKET":   req.OutputBucket,
				"OBJST_ENDPOINT": endpoint,
				"OBJST_SECRET":   req.SecretAccessKey,
				"OBJST_TOKEN":    req.AccessKeyID,
				"STEPS":          "8",
			},
		}},
		Tags: []string{imageManagerTag},
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, aiTaskCreateResponse{
		TaskID:                task.ID,
		Name:                  task.Name,
		CreatedAt:             task.CreatedAt,
		UpdatedAt:             task.UpdatedAt,
		CanceledAt:            task.CanceledAt,
		HTTPURI:               task.HTTPURI,
		Containers:            toAITaskContainers(task.Containers),
		Status:                task.Status,
		Tags:                  task.Tags,
		ErrorMessage:          task.ErrorMessage,
		Artifact:              withDownloadURL(task.Artifact, ""),
		ExecutionTimeLimitSec: task.ExecutionTimeLimitSec,
		// オリジナル項目
		Operation: "generate",
		Message:   "画像生成タスクを登録しました。",
	})
}

/*
AI画像加工タスク
*/
func (s *apiServer) handleCreateAIEditTask(w http.ResponseWriter, r *http.Request) {
	/***
	リクエストのバリデーション
	***/
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req createAIEditTaskRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if strings.TrimSpace(req.InputBucket) == "" || strings.TrimSpace(req.OutputBucket) == "" || strings.TrimSpace(req.Prompt) == "" || strings.TrimSpace(req.Suffix) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "入出力バケット、プロンプト、接尾辞は必須項目です。"})
		return
	}

	keys, err := normalizeImageKeys(req.ImageKeys)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// プロンプトの構成
	editTasks := make([][]string, 0, len(keys))
	for _, key := range keys {
		editTasks = append(editTasks, []string{key, req.Prompt, req.Suffix})
	}
	promptPayload, err := json.Marshal(editTasks)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: fmt.Sprintf("プロンプトの構成に失敗しました： %v", err)})
		return
	}

	// 認証情報のバリデーション
	if err := validateAICredentials(req.aiCredentialRequest); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	endpoint, err := resolveS3Endpoint(req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// コンテナ格納先の環境変数を取得
	fluxImage := strings.TrimSpace(os.Getenv(envDOKFluxImage))
	if fluxImage == "" {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "画像加工AIのコンテナイメージ格納先がサーバに設定されていません。"})
		return
	}

	// 高火力 DOKタスクの登録
	task, err := s.createDOKTask(r.Context(), req.AccessToken, req.AccessTokenSecret, dokCreateTaskRequest{
		Name: fmt.Sprintf("画像加工タスク-%d", time.Now().Unix()),
		Containers: []dokContainerCreation{{
			Image:      fluxImage,
			Command:    []string{},
			Entrypoint: []string{"/docker-entrypoint-img2img.sh"},
			Plan:       dokPlanH100,
			Environment: map[string]string{
				"PROMPT":              string(promptPayload),
				"OBJST_INPUT_BUCKET":  req.InputBucket,
				"OBJST_OUTPUT_BUCKET": req.OutputBucket,
				"OBJST_ENDPOINT":      endpoint,
				"OBJST_SECRET":        req.SecretAccessKey,
				"OBJST_TOKEN":         req.AccessKeyID,
				"STEPS":               "8",
			},
		}},
		Tags: []string{imageManagerTag},
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, aiTaskCreateResponse{
		TaskID:                task.ID,
		Name:                  task.Name,
		CreatedAt:             task.CreatedAt,
		UpdatedAt:             task.UpdatedAt,
		CanceledAt:            task.CanceledAt,
		HTTPURI:               task.HTTPURI,
		Containers:            toAITaskContainers(task.Containers),
		Status:                task.Status,
		Tags:                  task.Tags,
		ErrorMessage:          task.ErrorMessage,
		Artifact:              withDownloadURL(task.Artifact, ""),
		ExecutionTimeLimitSec: task.ExecutionTimeLimitSec,
		// オリジナル項目
		Operation: "edit",
		Message:   "画像編集タスクを登録しました。",
	})
}

/*
AI超解像タスク
*/
func (s *apiServer) handleCreateAISuperResolutionTask(w http.ResponseWriter, r *http.Request) {
	/***
	リクエストのバリデーション
	***/
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req createAISuperResolutionTaskRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if strings.TrimSpace(req.InputBucket) == "" || strings.TrimSpace(req.OutputBucket) == "" || strings.TrimSpace(req.Suffix) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "入出力バケット、接尾辞は必須項目です。"})
		return
	}

	keys, err := normalizeImageKeys(req.ImageKeys)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if req.Scale <= 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "倍率は正の整数で指定してください。"})
		return
	}

	// プロンプトの構成
	tasksPayloadRows := make([][]any, 0, len(keys))
	for _, key := range keys {
		tasksPayloadRows = append(tasksPayloadRows, []any{key, req.Scale, req.Suffix})
	}
	tasksPayload, err := json.Marshal(tasksPayloadRows)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: fmt.Sprintf("ペイロードの構成に失敗しました: %v", err)})
		return
	}

	// 認証情報のバリデーション
	if err := validateAICredentials(req.aiCredentialRequest); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	endpoint, err := resolveS3Endpoint(req.S3Endpoint)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}

	// コンテナ格納先の環境変数を取得
	realESRGANImage := strings.TrimSpace(os.Getenv(envDOKRealESRGANImage))
	if realESRGANImage == "" {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "超解像AIのコンテナイメージ格納先がサーバに設定されていません。"})
		return
	}

	// 高火力 DOKタスクの登録
	task, err := s.createDOKTask(r.Context(), req.AccessToken, req.AccessTokenSecret, dokCreateTaskRequest{
		Name: fmt.Sprintf("超解像タスク-%d", time.Now().Unix()),
		Containers: []dokContainerCreation{{
			Image:      realESRGANImage,
			Command:    []string{},
			Entrypoint: []string{"/docker-entrypoint.sh"},
			Plan:       dokPlanH100,
			Environment: map[string]string{
				"INPUT_BUCKET":  req.InputBucket,
				"OUTPUT_BUCKET": req.OutputBucket,
				"TASKS":         string(tasksPayload),
				"S3_ENDPOINT":   endpoint,
				"S3_SECRET":     req.SecretAccessKey,
				"S3_TOKEN":      req.AccessKeyID,
			},
		}},
		Tags: []string{imageManagerTag},
	})
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, aiTaskCreateResponse{
		TaskID:                task.ID,
		Name:                  task.Name,
		CreatedAt:             task.CreatedAt,
		UpdatedAt:             task.UpdatedAt,
		CanceledAt:            task.CanceledAt,
		HTTPURI:               task.HTTPURI,
		Containers:            toAITaskContainers(task.Containers),
		Status:                task.Status,
		Tags:                  task.Tags,
		ErrorMessage:          task.ErrorMessage,
		Artifact:              withDownloadURL(task.Artifact, ""),
		ExecutionTimeLimitSec: task.ExecutionTimeLimitSec,
		// オリジナル項目
		Operation: "super-resolution",
		Message:   "超解像タスクを登録しました。",
	})
}

/*
高火力 DOKタスク一覧取得
*/
func (s *apiServer) handleListTaggedAITasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req listAITasksRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if strings.TrimSpace(req.AccessToken) == "" || strings.TrimSpace(req.AccessTokenSecret) == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "アクセストークンおよびアクセストークンシークレットは必須項目です。"})
		return
	}

	tasks, err := s.listDOKTasksByTag(r.Context(), req.AccessToken, req.AccessTokenSecret, imageManagerTag)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}
	resp := aiTaskListResponse{Tag: imageManagerTag, Tasks: make([]aiTaskItem, 0, len(tasks))}

	for _, task := range tasks {
		item := aiTaskItem{
			ID:                    task.ID,
			Name:                  task.Name,
			CreatedAt:             task.CreatedAt,
			UpdatedAt:             task.UpdatedAt,
			CanceledAt:            task.CanceledAt,
			HTTPURI:               task.HTTPURI,
			Containers:            make([]aiTaskContainer, 0, len(task.Containers)),
			Status:                task.Status,
			Tags:                  task.Tags,
			ErrorMessage:          task.ErrorMessage,
			Artifact:              nil,
			ExecutionTimeLimitSec: task.ExecutionTimeLimitSec,
		}
		item.Containers = toAITaskContainers(task.Containers)

		if task.Artifact != nil {
			downloadURL, dlErr := s.getDOKArtifactDownloadURL(r.Context(), req.AccessToken, req.AccessTokenSecret, task.Artifact.ID)
			if dlErr != nil {
				downloadURL = ""
			}
			item.Artifact = withDownloadURL(task.Artifact, downloadURL)
		}

		resp.Tasks = append(resp.Tasks, item)
	}

	writeJSON(w, http.StatusOK, resp)
}

// 高火力 DOKのタスク一覧取得APIを呼び出すための関数。
func (s *apiServer) listDOKTasksByTag(ctx context.Context, accessToken, accessTokenSecret, tag string) ([]dokTask, error) {
	// タスク一覧取得APIはページネーション対応しているが、今回は10件までのタスクを取得する想定で固定値を渡す。
	query := url.Values{}
	query.Set("page", "1")
	query.Set("page_size", "10")
	query.Set("tag", tag)

	res, err := s.doDOKRequest(ctx, accessToken, accessTokenSecret, http.MethodGet, "/tasks/?"+query.Encode(), nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("高火力 DOKのタスク一覧取得APIがステータス %d を返却しました。", res.StatusCode)
	}

	var payload dokTaskListResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("高火力 DOKのタスク一覧取得APIのレスポンスのデコードに失敗しました： %w", err)
	}

	out := make([]dokTask, 0, len(payload.Results))
	for _, raw := range payload.Results {
		out = append(out, fromDOKTaskRaw(raw))
	}
	return out, nil
}

// 高火力 DOKのアーティファクトダウンロードURL取得APIを呼び出すための関数。
func (s *apiServer) getDOKArtifactDownloadURL(ctx context.Context, accessToken, accessTokenSecret, artifactID string) (string, error) {
	res, err := s.doDOKRequest(ctx, accessToken, accessTokenSecret, http.MethodGet, "/artifacts/"+artifactID+"/download/", nil)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("高火力 DOKのアーティファクトダウンロードURL取得APIがステータス %d を返却しました。", res.StatusCode)
	}

	var payload dokURLResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("高火力 DOKのアーティファクトダウンロードURL取得APIのレスポンスのデコードに失敗しました： %w", err)
	}
	return payload.URL, nil
}

// 共通処理で、高火力 DOKのAPIおよびS3互換API向け認証情報の検証。
func validateAICredentials(req aiCredentialRequest) error {
	if strings.TrimSpace(req.AccessToken) == "" || strings.TrimSpace(req.AccessTokenSecret) == "" {
		return errors.New("アクセストークンおよびアクセストークンシークレットは必須項目です。")
	}
	if strings.TrimSpace(req.AccessKeyID) == "" || strings.TrimSpace(req.SecretAccessKey) == "" {
		return errors.New("アクセスキーIDおよびシークレットアクセスキーは必須項目です。")
	}
	if strings.TrimSpace(req.S3Endpoint) == "" {
		return errors.New("s3Endpointは必須項目です。")
	}
	return nil
}

// 共通処理で、高火力 DOKのタスク登録APIを呼び出すための関数。
func (s *apiServer) createDOKTask(ctx context.Context, accessToken, accessTokenSecret string, payload dokCreateTaskRequest) (*dokTask, error) {
	res, err := s.doDOKRequest(ctx, accessToken, accessTokenSecret, http.MethodPost, "/tasks/", payload)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("高火力 DOKのタスク登録APIがステータス %d を返却しました。", res.StatusCode)
	}

	var raw dokTaskRaw
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("高火力 DOKのタスク登録APIのレスポンスのデコードに失敗しました： %w", err)
	}
	task := fromDOKTaskRaw(raw)
	return &task, nil
}

// 高火力 DOKのAPIを呼び出すための共通関数。
func (s *apiServer) doDOKRequest(ctx context.Context, accessToken, accessTokenSecret, method, path string, body any) (*http.Response, error) {
	url := strings.TrimSuffix(sakuraDOKAPIBase, "/") + path

	var reqBodyReader *strings.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("高火力 DOKのリクエストボディの構成に失敗しました： %w", err)
		}
		reqBodyReader = strings.NewReader(string(buf))
	} else {
		reqBodyReader = strings.NewReader("")
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBodyReader)
	if err != nil {
		return nil, fmt.Errorf("高火力 DOKのリクエスト作成に失敗しました： %w", err)
	}
	req.SetBasicAuth(accessToken, accessTokenSecret)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("高火力 DOKのAPI呼び出しに失敗しました： %w", err)
	}
	return res, nil
}

func toAITaskContainers(containers []dokContainer) []aiTaskContainer {
	out := make([]aiTaskContainer, 0, len(containers))
	for _, container := range containers {
		out = append(out, aiTaskContainer{
			Index:            container.Index,
			Image:            container.Image,
			Registry:         container.Registry,
			Command:          container.Command,
			Entrypoint:       container.Entrypoint,
			Environment:      container.Environment,
			HTTP:             container.HTTP,
			SSH:              container.SSH,
			Plan:             container.Plan,
			ExitCode:         container.ExitCode,
			ExecutionSeconds: container.ExecutionSeconds,
			StartAt:          container.StartAt,
			StopAt:           container.StopAt,
		})
	}
	return out
}

func withDownloadURL(artifact *aiTaskArtifact, downloadURL string) *aiTaskArtifact {
	if artifact == nil {
		return nil
	}
	return &aiTaskArtifact{
		ID:          artifact.ID,
		CreatedAt:   artifact.CreatedAt,
		UpdatedAt:   artifact.UpdatedAt,
		Filename:    artifact.Filename,
		SizeBytes:   artifact.SizeBytes,
		DownloadURL: downloadURL,
	}
}

func fromDOKTaskRaw(raw dokTaskRaw) dokTask {
	return dokTask{
		ID:                    raw.ID,
		Name:                  raw.Name,
		CreatedAt:             raw.CreatedAt,
		UpdatedAt:             raw.UpdatedAt,
		CanceledAt:            raw.CanceledAt,
		HTTPURI:               raw.HTTPURI,
		Containers:            fromDOKContainerRaws(raw.Containers),
		Status:                raw.Status,
		Tags:                  raw.Tags,
		ErrorMessage:          raw.ErrorMessage,
		Artifact:              fromDOKArtifactRaw(raw.Artifact),
		ExecutionTimeLimitSec: raw.ExecutionTimeLimitSec,
	}
}

func fromDOKContainerRaws(raws []dokContainerRaw) []dokContainer {
	out := make([]dokContainer, 0, len(raws))
	for _, raw := range raws {
		out = append(out, dokContainer{
			Index:            raw.Index,
			Image:            raw.Image,
			Registry:         raw.Registry,
			Command:          raw.Command,
			Entrypoint:       raw.Entrypoint,
			Environment:      raw.Environment,
			HTTP:             raw.HTTP,
			SSH:              raw.SSH,
			Plan:             raw.Plan,
			ExitCode:         raw.ExitCode,
			ExecutionSeconds: raw.ExecutionSeconds,
			StartAt:          raw.StartAt,
			StopAt:           raw.StopAt,
		})
	}
	return out
}

func fromDOKArtifactRaw(raw *dokArtifactRaw) *dokArtifact {
	if raw == nil {
		return nil
	}
	return &dokArtifact{
		ID:        raw.ID,
		CreatedAt: raw.CreatedAt,
		UpdatedAt: raw.UpdatedAt,
		Filename:  raw.Filename,
		SizeBytes: raw.SizeBytes,
	}
}
