# Video Editor Agent v0

Demo-ready AI-assisted video trimming:

- Frontend: Next.js + TypeScript + Tailwind + shadcn/ui
- Backend: FastAPI + Gemini intent parsing + FFmpeg execution
- Storage: local files only (`media/uploads`, `media/outputs`)

## Project structure

- `frontend/` Next.js web app
- `backend/` FastAPI API server
- `media/` uploaded and processed files

## Prerequisites

- Node.js 20+
- Python 3.11+
- `ffmpeg` and `ffprobe` installed and available in PATH

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set GEMINI_API_KEY in backend/.env (optional if using fallback parser)
uvicorn app.main:app --reload --port 8000
```

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Backend on Fly.io

1. Install Fly CLI and login:
```bash
fly auth login
```
2. Create app (first time only):
```bash
cd backend
fly launch --no-deploy --copy-config
```
3. Set secrets/env:
```bash
fly secrets set GEMINI_API_KEY=your_key
fly secrets set CORS_ORIGINS=https://your-frontend.vercel.app
fly secrets set VERCEL_FRONTEND_URL=https://your-frontend.vercel.app
```
4. Deploy:
```bash
fly deploy -c fly.toml
```

### Frontend on Vercel

1. Import `frontend/` as a Vercel project.
2. Set environment variable in Vercel:
```bash
NEXT_PUBLIC_API_BASE=https://your-fly-backend.fly.dev
```
3. Deploy.

The frontend already rewrites `/api/*` and `/media/*` to `NEXT_PUBLIC_API_BASE`.

## API endpoints

- `GET /health`
- `POST /upload` (`multipart/form-data`, field `file`)
- `POST /edit-request` (`{ "video_id": "...", "prompt": "trim from 00:12 to 00:47" }`)
- `POST /analyze/sprites` (`multipart/form-data`)
  - fields: `file`, optional `interval_sec`, `columns`, `rows`, `thumb_width`
  - returns sprite sheet URLs + per-tile timestamp mapping for AI planning
- `POST /analyze/token-estimate` (`application/json`)
  - fields: `duration_sec`, optional `interval_sec`, `columns`, `rows`, `thumb_width`
  - returns estimated token usage for sprite-sheet approach vs direct video upload
- `POST /analyze/token-estimate-from-file` (`multipart/form-data`)
  - fields: `file`, optional `interval_sec`, `columns`, `rows`, `thumb_width`
  - same estimate, with backend deriving duration from uploaded file
- `POST /ai/suggest-cuts-from-sprites` (`application/json`)
  - fields: `prompt`, `duration_sec`, `sprite_interval_sec`, `total_frames`, `sheets_count`
  - returns cut suggestions `{start_sec,end_sec,reason,confidence}` for timeline application

## Tests

### Backend

```bash
cd backend
pytest -q
```

### Frontend

```bash
cd frontend
npm run test
```

CI runs backend tests and frontend lint/test/build on push and PR.

## Notes

- v0 supports one action: `trim_video` with two operations:
  - `remove_segment` (default for "trim/cut from X to Y"): removes X-Y and stitches remaining video
  - `extract_range` (for "keep only X to Y"): outputs only X-Y clip
- Session state is in-memory, resets when backend restarts
- This is intentionally lean for demo/showcase use
- Sprite generation is non-persistent by default (`SPRITE_PERSIST=false`): files are created temporarily and cleaned up immediately.
- Video duration is capped by `MAX_VIDEO_DURATION_SEC` (default `10` seconds) for predictable backend load.
