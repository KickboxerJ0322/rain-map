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
- 表示時刻は `Asia/Tokyo` 基準で 5 分刻みに丸めています。
- 最新タイルが未反映で 404 になる場合を考えて、1 つ前の基準時刻へフォールバックします。
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

## 参考

- 気象庁データ利用ガイド
  - https://www.data.jma.go.jp/developer/weatherdataguide/appendix/2-1-b.html
- 気象庁 雨雲の動き
  - https://www.jma.go.jp/bosai/nowc/
