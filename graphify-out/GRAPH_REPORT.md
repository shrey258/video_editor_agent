# Graph Report - video_editor_agent  (2026-09-29)

## Corpus Check
- Corpus is ~15,015 words - fits in a single context window. You may not need a graph.

## Summary
- 349 nodes · 614 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.88)
- Token cost: 97,844 input · 0 output

## Community Hubs (Navigation)
- UI Primitives (shadcn)
- API Routes
- Inspector & AI Chat
- Backend API Tests
- Timeline Editing
- FFmpeg Edit Pipeline
- Docs, CI & Architecture
- Frontend Dev Tooling
- TypeScript Config
- Video Store (Zustand)
- Gemini Intent Parsing
- Frontend Runtime Deps
- shadcn Config
- App Shell & Icon
- Vitest Config
- ESLint Config
- Services Package
- Next Env Types

## God Nodes (most connected - your core abstractions)
1. `cn()` - 24 edges
2. `export_from_file()` - 16 edges
3. `Timeline()` - 16 edges
4. `compilerOptions` - 16 edges
5. `react` - 15 edges
6. `edit_request()` - 10 edges
7. `_run()` - 10 edges
8. `Video Editor Agent README` - 10 edges
9. `analyze_sprites()` - 9 edges
10. `analyze_token_estimate_from_file()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Video Editor Agent README` --references--> `CI Workflow (GitHub Actions)`  [INFERRED]
  README.md → .github/workflows/ci.yml
- `Backend Python dependencies` --implements--> `FastAPI backend`  [INFERRED]
  backend/requirements.txt → README.md
- `mprocs dev process runner` --references--> `Next.js frontend`  [INFERRED]
  mprocs.yaml → README.md
- `edit_request()` --uses--> `EditRequest`  [INFERRED]
  backend/app/main.py → backend/app/schemas.py
- `edit_request()` --uses--> `EditResponse`  [INFERRED]
  backend/app/main.py → backend/app/schemas.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **AI-assisted edit pipeline (sprites, Gemini, ffmpeg export)** — readme_sprite_engine, readme_gemini, readme_ffmpeg, readme_ai_insight_engine [INFERRED 0.85]
- **Dev and CI workflow** — mprocs, github_workflows_ci, backend_requirements [INFERRED 0.75]

## Communities (21 total, 5 thin omitted)

### Community 0 - "UI Primitives (shadcn)"
Cohesion: 0.06
Nodes (45): Badge(), BadgeProps, badgeVariants, Button, ButtonProps, buttonVariants, Card(), CardContent() (+37 more)

### Community 1 - "API Routes"
Cohesion: 0.09
Nodes (47): ai_suggest_cuts_from_sprites(), analyze_sprites(), analyze_token_estimate(), analyze_token_estimate_from_file(), _enforce_max_duration(), fallback_exception_handler(), health(), UploadFile (+39 more)

### Community 2 - "Inspector & AI Chat"
Cohesion: 0.10
Nodes (23): buildChatHistory(), buildConversationSummary(), ChatMessage, ChatTurn, CutSuggestion, ExportResponse, Inspector(), handleKeyDown() (+15 more)

### Community 3 - "Backend API Tests"
Cohesion: 0.11
Nodes (11): asyncio, test_edit_request_applies_speed_range(), test_export_from_file_applies_segment_speed_ranges(), fake_render_segments_with_speed(), test_export_from_file_rejects_invalid_speed(), test_export_splits_full_speed_when_trims_are_present(), test_suggest_cuts_accepts_context_fields(), test_token_estimate_from_file_rejects_over_max_duration() (+3 more)

### Community 4 - "Timeline Editing"
Cohesion: 0.13
Nodes (17): areRangesEquivalent(), formatRulerTime(), generateTicks(), SpeedWidget, Timeline(), addSpeedAtPlayhead(), addTrimAtPlayhead(), handleToolbarAction() (+9 more)

### Community 5 - "FFmpeg Edit Pipeline"
Cohesion: 0.30
Nodes (18): _build_speed_segments(), edit_request(), export_from_file(), _merge_ranges(), validate_trim(), apply_speed_multiplier(), _build_atempo_chain(), extract_range() (+10 more)

### Community 6 - "Docs, CI & Architecture"
Cohesion: 0.15
Nodes (19): Backend Python dependencies, CI Workflow (GitHub Actions), CI backend job (pytest), CI frontend job (lint, test, build), Backend HTTP routes, Editor data flow (upload to export), INDEX.md file map, mprocs dev process runner (+11 more)

### Community 7 - "Frontend Dev Tooling"
Cohesion: 0.10
Nodes (19): devDependencies, autoprefixer, eslint, eslint-config-next, jsdom, postcss, tailwindcss, @testing-library/jest-dom (+11 more)

### Community 8 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 9 - "Video Store (Zustand)"
Cohesion: 0.15
Nodes (14): ACCEPTED_TYPES, makeClamp(), normalizeSpeedRanges(), normalizeTrimRanges(), SpeedRange, subtractRanges(), TrimRange, useVideoStore (+6 more)

### Community 10 - "Gemini Intent Parsing"
Cohesion: 0.23
Nodes (13): _extract_json(), _fallback_suggest_cuts(), parse_intent(), _regex_fallback(), suggest_cuts_from_sprites(), parse_time_like(), test_parse_intent_fallback_speed_range(), httpx (+5 more)

### Community 11 - "Frontend Runtime Deps"
Cohesion: 0.13
Nodes (15): dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-scroll-area, @radix-ui/react-separator, @radix-ui/react-slider (+7 more)

### Community 12 - "shadcn Config"
Cohesion: 0.14
Nodes (13): aliases, components, utils, rsc, $schema, style, tailwind, baseColor (+5 more)

### Community 13 - "App Shell & Icon"
Cohesion: 0.20
Nodes (7): frontend_app_globals, AI Video Editor App Icon, Green Play Button Motif, metadata, nextConfig, next, ref_vercel_analytics_next

### Community 14 - "Vitest Config"
Cohesion: 0.40
Nodes (4): rootDir, ref_node_path, ref_node_url, ref_vitest_config

### Community 15 - "ESLint Config"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

## Knowledge Gaps
- **103 isolated node(s):** `next/core-web-vitals`, `next/typescript`, `metadata`, `$schema`, `style` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 159 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Editor data flow (upload to export)` connect `Docs, CI & Architecture` to `Video Store (Zustand)`, `Inspector & AI Chat`, `Timeline Editing`?**
  _High betweenness centrality (0.325) - this node is a cross-community bridge._
- **Why does `Backend HTTP routes` connect `Docs, CI & Architecture` to `API Routes`, `Gemini Intent Parsing`, `FFmpeg Edit Pipeline`?**
  _High betweenness centrality (0.311) - this node is a cross-community bridge._
- **Why does `react` connect `UI Primitives (shadcn)` to `Video Store (Zustand)`, `Inspector & AI Chat`, `Timeline Editing`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `export_from_file()` (e.g. with `ExportResponse` and `TrimRange`) actually correct?**
  _`export_from_file()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Timeline()` (e.g. with `onKeyDown()` and `onMouseMove()`) actually correct?**
  _`Timeline()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `next/core-web-vitals`, `next/typescript`, `metadata` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Primitives (shadcn)` be split into smaller, more focused modules?**
  _Cohesion score 0.05989110707803993 - nodes in this community are weakly interconnected._