# Rain Map

Google Maps 上に、気象庁の「雨雲の動き」を重ねて表示するシンプルな Web アプリです。  
Node.js + Express で静的ファイルを配信し、Cloud Run へデプロイできる構成になっています。

## 現在の機能

- Google Maps 上に雨雲レイヤーを重ねて表示
- 実況から `+60分` までを `5分刻み` で切り替え
- 再生 / 停止、透明度変更、現在地へ移動
- 雨雲レイヤーの凡例表示 / 非表示
- GitHub Actions から Cloud Run へ自動デプロイ

## ディレクトリ構成

```text
rain-map/
  .github/
    workflows/
      deploy-cloud-run.yml
  public/
    app.js
    index.html
    rain-map_logo.png
    style.css
  .dockerignore
  .gitignore
  Dockerfile
  package-lock.json
  package.json
  README.md
  server.js
```

## ローカル起動

1. 依存関係をインストールします。

```bash
npm install
```

2. Google Maps JavaScript API キーを環境変数に設定します。

PowerShell:

```powershell
$env:GOOGLE_MAPS_API_KEY="YOUR_API_KEY"
```

3. アプリを起動します。

```bash
npm start
```

4. ブラウザで `http://localhost:8080` を開きます。

## 必要な環境変数

- `GOOGLE_MAPS_API_KEY`
  - Google Maps JavaScript API のキー
- `PORT`
  - 任意。未設定時は `8080`
  - Cloud Run では自動設定されます

## 技術メモ

- サーバーは [server.js](./server.js) で Express を使って `public/` を配信しています
- `/config.js` で `GOOGLE_MAPS_API_KEY` をブラウザへ渡しています
- サーバーは `0.0.0.0` で待ち受け、Cloud Run で動作します
- 雨雲データは気象庁のタイルと `targetTimes_N1.json` / `targetTimes_N2.json` を利用しています
- 時刻データは UTC で扱い、画面表示は `Asia/Tokyo` に変換しています

## Cloud Run デプロイ

このリポジトリは `Dockerfile` を含んでいますが、現在の GitHub Actions では `source: .` を使って Cloud Run へソースデプロイしています。

### 手動デプロイ例

1. プロジェクトを設定します。

```bash
gcloud config set project jumpeicloud
```

2. 必要な API を有効化します。

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

3. Cloud Run へデプロイします。

```bash
gcloud run deploy rain-map ^
  --source . ^
  --region asia-northeast1 ^
  --allow-unauthenticated ^
  --set-env-vars GOOGLE_MAPS_API_KEY=YOUR_API_KEY
```

4. 公開 URL を確認します。

```bash
gcloud run services describe rain-map --project jumpeicloud --region asia-northeast1 --format="value(status.url)"
```

## GitHub Actions 自動デプロイ

`main` ブランチへの `push` で、[.github/workflows/deploy-cloud-run.yml](./.github/workflows/deploy-cloud-run.yml) が実行され、Cloud Run に自動デプロイされます。

### GitHub Secrets

- `GOOGLE_MAPS_API_KEY`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### 現在の GCP 設定

- Project ID: `jumpeicloud`
- Region: `asia-northeast1`
- Cloud Run Service: `rain-map`

### Workload Identity Federation 設定の要点

GitHub Actions から Google Cloud に安全にデプロイするため、サービスアカウントと Workload Identity Federation を利用します。

1. サービスアカウントを作成

```bash
gcloud iam service-accounts create github-deployer \
  --project jumpeicloud \
  --display-name "GitHub Cloud Run Deployer"
```

2. 必要なロールを付与

```bash
gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/run.sourceDeveloper"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding jumpeicloud \
  --member="serviceAccount:github-deployer@jumpeicloud.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
```

3. Workload Identity Pool / Provider を作成

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

4. GitHub リポジトリからサービスアカウントを使えるようにする

```bash
gcloud iam service-accounts add-iam-policy-binding \
  github-deployer@jumpeicloud.iam.gserviceaccount.com \
  --project jumpeicloud \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/331230486346/locations/global/workloadIdentityPools/github/attribute.repository/KickboxerJ0322/rain-map"
```

5. Provider 名を確認し、GitHub Secrets に登録

```bash
gcloud iam workload-identity-pools providers describe rain-map \
  --project jumpeicloud \
  --location global \
  --workload-identity-pool github \
  --format="value(name)"
```

登録する値:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`: 上記コマンドの出力値
- `GCP_SERVICE_ACCOUNT`: `github-deployer@jumpeicloud.iam.gserviceaccount.com`
- `GOOGLE_MAPS_API_KEY`: Google Maps JavaScript API キー

## 参考

- 気象庁 開発者向け資料
  - https://www.data.jma.go.jp/developer/weatherdataguide/appendix/2-1-b.html
- 気象庁 雨雲の動き
  - https://www.jma.go.jp/bosai/nowc/
