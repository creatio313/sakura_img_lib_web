package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const sakuraObjectStorageAPIBase = "https://secure.sakura.ad.jp/cloud/zone/is1a/api/objectstorage/1.0"

/*
**
対クライアントAPIのリクエストとレスポンスの構造体定義
**
*/
type listSitesAndBucketsRequest struct {
	AccessToken       string `json:"accessToken"`
	AccessTokenSecret string `json:"accessTokenSecret"`
}

type listSitesAndBucketsResponse struct {
	Sites []siteWithBuckets `json:"sites"`
}

type siteWithBuckets struct {
	ID                         string   `json:"id"`
	APIZones                   []string `json:"apiZones,omitempty"`
	ControlPanelURL            string   `json:"controlPanelUrl,omitempty"`
	DisplayNameEnUS            string   `json:"displayNameEnUs,omitempty"`
	DisplayNameJa              string   `json:"displayNameJa,omitempty"`
	DisplayName                string   `json:"displayName,omitempty"`
	DisplayOrder               int      `json:"displayOrder,omitempty"`
	EndpointBase               string   `json:"endpointBase,omitempty"`
	IAMEndpoint                string   `json:"iamEndpoint,omitempty"`
	IAMEndpointForControlPanel string   `json:"iamEndpointForControlPanel,omitempty"`
	Region                     string   `json:"region,omitempty"`
	S3Endpoint                 string   `json:"s3Endpoint,omitempty"`
	S3EndpointForControlPanel  string   `json:"s3EndpointForControlPanel,omitempty"`
	StorageZones               []string `json:"storageZones,omitempty"`
	PlanFamily                 string   `json:"planFamily,omitempty"`
	Buckets                    []bucket `json:"buckets"`
	BucketFetchError           string   `json:"bucketFetchError,omitempty"`
}

/*
**
サイト一覧取得APIの応答構造体
**
*/
type clustersResponse struct {
	Data []cluster `json:"data"`
}

type cluster struct {
	APIZones                   []string `json:"api_zone"`
	ControlPanelURL            string   `json:"control_panel_url"`
	DisplayNameEnUS            string   `json:"display_name_en_us"`
	DisplayNameJa              string   `json:"display_name_ja"`
	DisplayName                string   `json:"display_name"`
	DisplayOrder               int      `json:"display_order"`
	EndpointBase               string   `json:"endpoint_base"`
	IAMEndpoint                string   `json:"iam_endpoint"`
	IAMEndpointForControlPanel string   `json:"iam_endpoint_for_control_panel"`
	ID                         string   `json:"id"`
	Region                     string   `json:"region"`
	S3Endpoint                 string   `json:"s3_endpoint"`
	S3EndpointForControlPanel  string   `json:"s3_endpoint_for_control_panel"`
	StorageZones               []string `json:"storage_zone"`
	PlanFamily                 string   `json:"plan_family"`
}

/*
**
バケット一覧取得APIの応答構造体
**
*/
type bucketListResponse struct {
	Data []bucket `json:"data"`
}

type bucket struct {
	Name       string     `json:"name"`
	ResourceID string     `json:"resource_id,omitempty"`
	Plan       bucketPlan `json:"plan,omitempty"`
}

type bucketPlan struct {
	Type             string `json:"type,omitempty"`
	ServiceClassPath string `json:"service_class_path,omitempty"`
}

func (s *apiServer) handleListSitesAndBuckets(w http.ResponseWriter, r *http.Request) {
	/***
	リクエストのバリデーション
	***/
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	var req listSitesAndBucketsRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if req.AccessToken == "" || req.AccessTokenSecret == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "accessTokenとaccessTokenSecretは必須です。"})
		return
	}

	/***
	オブジェクトストレージのAPIを呼び出して、サイト一覧を取得
	***/
	clusters, err := s.fetchClusters(r.Context(), req.AccessToken, req.AccessTokenSecret)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorResponse{Error: err.Error()})
		return
	}

	/***
	サイトごとにバケット一覧を取得してレスポンスを組み立てる。バケットの取得に失敗してもサイト情報は返すが、bucketsは空でエラーメッセージを入れる。
	***/
	result := listSitesAndBucketsResponse{Sites: make([]siteWithBuckets, 0, len(clusters))}
	for _, c := range clusters {
		site := siteWithBuckets{
			ID:                         c.ID,
			APIZones:                   c.APIZones,
			ControlPanelURL:            c.ControlPanelURL,
			DisplayNameEnUS:            c.DisplayNameEnUS,
			DisplayNameJa:              c.DisplayNameJa,
			DisplayName:                c.DisplayName,
			DisplayOrder:               c.DisplayOrder,
			EndpointBase:               c.EndpointBase,
			IAMEndpoint:                c.IAMEndpoint,
			IAMEndpointForControlPanel: c.IAMEndpointForControlPanel,
			Region:                     c.Region,
			S3Endpoint:                 c.S3Endpoint,
			S3EndpointForControlPanel:  c.S3EndpointForControlPanel,
			StorageZones:               c.StorageZones,
			PlanFamily:                 c.PlanFamily,
			Buckets:                    []bucket{},
		}

		// 対象サイトのバケットを取得する。
		buckets, bucketErr := s.fetchBuckets(r.Context(), req.AccessToken, req.AccessTokenSecret, c.ID)
		if bucketErr != nil {
			site.BucketFetchError = bucketErr.Error()
		} else {
			site.Buckets = buckets
		}
		result.Sites = append(result.Sites, site)
	}

	//結果の返却
	writeJSON(w, http.StatusOK, result)
}

// サイト一覧を取得
func (s *apiServer) fetchClusters(ctx context.Context, accessToken, accessTokenSecret string) ([]cluster, error) {
	url := sakuraObjectStorageAPIBase + "/fed/v1/clusters"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("サイト一覧取得のリクエスト作成に失敗しました： %w", err)
	}
	req.SetBasicAuth(accessToken, accessTokenSecret)

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("サイト一覧取得のAPI呼び出しに失敗しました： %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("サイト一覧取得のAPIがステータス %d を返しました", res.StatusCode)
	}

	var payload clustersResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("サイト一覧取得のレスポンスのデコードに失敗しました： %w", err)
	}

	return payload.Data, nil
}

// サイトIDを指定してバケット一覧を取得
func (s *apiServer) fetchBuckets(ctx context.Context, accessToken, accessTokenSecret, siteID string) ([]bucket, error) {
	url := fmt.Sprintf("%s/%s/v2/buckets", sakuraObjectStorageAPIBase, siteID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("バケット一覧取得のリクエスト作成に失敗しました： %w", err)
	}
	req.SetBasicAuth(accessToken, accessTokenSecret)

	res, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("バケット一覧取得のAPI呼び出しに失敗しました： %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("バケット一覧取得のAPIがステータス %d を返しました", res.StatusCode)
	}

	var payload bucketListResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("バケット一覧取得のレスポンスのデコードに失敗しました： %w", err)
	}

	return payload.Data, nil
}
