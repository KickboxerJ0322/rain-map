# Rain Nowcast Map

Google Maps の上に、気象庁「雨雲の動き」のタイルを重ねて表示する Node.js + Express の MVP です。

## 構成

```text
rain-nowcast-map/
  package.json
  server.js
  .gitignore
  README.md
  public/
    index.html
    style.css
    app.js
```

## セットアップ

1. 依存関係をインストールします。

```bash
npm install
```

2. Google Maps JavaScript API のキーを環境変数に設定します。

```bash
$env:GOOGLE_MAPS_API_KEY="YOUR_API_KEY"
```

3. 開発サーバーを起動します。

```bash
npm start
```

4. ブラウザで `http://localhost:8080` を開きます。

## Google Maps API の設定

- Google Cloud Console で `Maps JavaScript API` を有効化してください。
- API キーは `GOOGLE_MAPS_API_KEY` で渡します。
- 本リポジトリには API キーを書き込まないでください。

## 実装メモ

- 気象庁の高解像度降水ナウキャスト画像は `https://www.jma.go.jp/bosai/jmatile/data/nowc` 配下のタイルを利用しています。
- 利用可能な実況・予報時刻は `targetTimes_N1.json` / `targetTimes_N2.json` を参照して取得しています。
- タイル URL の時刻は UTC で扱い、UI 表示は `Asia/Tokyo` で整形しています。
- Cloud Run では `PORT` 環境変数を優先し、未指定時は `8080` を使います。

## Cloud Run

Cloud Run では次の環境変数を設定してください。

- `GOOGLE_MAPS_API_KEY`
- `PORT` は Cloud Run 側から自動設定されます

`server.js` は `0.0.0.0` で待ち受け、`public/` を静的配信します。

### Cloud Run へデプロイ

1. Google Cloud でプロジェクトを選択します。

```bash
gcloud config set project YOUR_PROJECT_ID
```

2. 必要な API を有効化します。

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

3. デプロイします。

```bash
gcloud run deploy rain-map ^
  --source . ^
  --region asia-northeast1 ^
  --allow-unauthenticated ^
  --set-env-vars GOOGLE_MAPS_API_KEY=YOUR_API_KEY
```

4. 表示された Service URL をブラウザで開きます。

補足:

- `Dockerfile` を含めているので、そのまま Cloud Run へデプロイできます。
- Google Maps API キーには HTTP リファラー制限をかけ、Cloud Run の URL を許可するのがおすすめです。
- 独自ドメインを使う場合は、Cloud Run のカスタムドメイン設定を追加してください。

## GitHub Push 連動デプロイ

`main` への push で Cloud Run に自動デプロイする GitHub Actions を `.github/workflows/deploy-cloud-run.yml` に用意しています。

### 事前に必要な GitHub Secrets

- `GOOGLE_MAPS_API_KEY`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### 推奨構成

Google Cloud では、サービスアカウントキーを GitHub に置く代わりに Workload Identity Federation を使う構成を推奨します。

1. デプロイ用のサービスアカウントを作成します。

```bash
gcloud iam service-accounts create github-deployer \
  --project jumpeicloud \
  --display-name "GitHub Cloud Run Deployer"
```

2. Cloud Run デプロイに必要な権限を付与します。

```bash
gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

3. GitHub Actions 用の Workload Identity Pool と Provider を作成します。

```bash
gcloud iam workload-identity-pools create github \
  --project jumpeicloud \
  --location global \
  --display-name "GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc rain-map \
  --project jumpeicloud \
  --location global \
  --workload-identity-pool github \
  --display-name "rain-map GitHub Provider" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='KickboxerJ0322/rain-map'"
```

4. GitHub リポジトリからサービスアカウントを使えるようにします。

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-deployer@jumpeicloud.iam.gserviceaccount.com \
  --project jumpeicloud \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/KickboxerJ0322/rain-map"
```

5. Provider 名を取得し、GitHub Secrets に登録します。

```bash
gcloud iam workload-identity-pools providers describe rain-map \
  --project jumpeicloud \
  --location global \
  --workload-identity-pool github \
  --format="value(name)"
```

GitHub に登録する値:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: 上のコマンドの出力
- `GCP_SERVICE_ACCOUNT`: `github-deployer@jumpeicloud.iam.gserviceaccount.com`
- `GOOGLE_MAPS_API_KEY`: あなたの Maps JavaScript API キー

### 公開 URL の確認

自動デプロイ後の URL は次で取得できます。

```bash
gcloud run services describe rain-map --project jumpeicloud --region asia-northeast1 --format="value(status.url)"
```

## 参考

- 気象庁データ利用ガイド
  - https://www.data.jma.go.jp/developer/weatherdataguide/appendix/2-1-b.html
- 気象庁 雨雲の動き
  - https://www.jma.go.jp/bosai/nowc/
