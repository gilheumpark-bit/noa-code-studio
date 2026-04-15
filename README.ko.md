<div align="center">

<img src=".github/icon.png" alt="NOA Code Studio" width="128" />

# NOA Code Studio

**AI 기반 데스크톱 IDE — 검증 파이프라인 내장**

로컬 우선. 당신의 키. 당신의 파일. 당신의 머신.

[![License](https://img.shields.io/badge/CC--BY--NC--4.0-blue?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-47848F?style=flat-square&logo=electron&logoColor=white)](#기술-스택)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](#기술-스택)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](#기술-스택)
![Version](https://img.shields.io/badge/version-0.2.0--beta-green?style=flat-square)

[English](README.md) | [한국어](#빠른-시작)

</div>

---

## 빠른 시작

```bash
git clone https://github.com/gilheumpark-bit/noa-code-studio.git
cd noa-code-studio
pnpm install

# 개발 모드 (핫 리로드)
pnpm --filter noa-code-studio run dev:electron

# 프로덕션 빌드
pnpm --filter noa-code-studio run build:electron
```

**요구사항:** Node.js 20+, pnpm 9+, Git

## 왜 데스크톱인가

| 필요 기능 | 브라우저 IDE | NOA Code Studio |
|-----------|-------------|-----------------|
| 로컬 파일 | File System Access API (제한적) | **네이티브 fs + chokidar** |
| Git | isomorphic-git (메모리) | **실제 git CLI** |
| 터미널 | PTY 없음 | **node-pty + xterm.js** |
| API 키 보안 | localStorage (평문) | **OS 키체인 (DPAPI/Keychain/libsecret)** |
| 로컬 AI | CORS 차단 | **직접 Ollama HTTP (200ms 이하)** |

## 주요 기능

- **AI 프로바이더 6종** — Gemini, OpenAI, Claude, Groq, Ollama, LM Studio (BYOK)
- **탭 자동완성 (FIM)** — Ollama 로컬 200ms 이하, 6개 모델 패밀리 네이티브 토큰
- **MCP 프로토콜** — stdio JSON-RPC + HTTP, 자동 재시작, 하트비트
- **멀티파일 에이전트** — 의존성 그래프, AI 계획, 스냅샷 롤백
- **Quill 검증** — 300+ 룰, worker_threads 병렬, Tier A/B/C
- **GitHub 통합** — 15+ 엔드포인트, 페이지네이션, ETag 캐싱, Gist, PR 리뷰
- **NOA 보안 게이트** — 프롬프트 인젝션/코드 인젝션/PII 누출 3중 스캔
- **40+ 키보드 단축키** — macOS Cmd 매핑, 충돌 감지, 커스텀 리바인딩
- **크래시 리포터** — 구조화 JSON 로그, 세션 추적, 브레드크럼 트레일
- **토큰 예산** — 프로바이더별 일일 추적, 30일 히스토리, 80% 경고

## 기술 스택

Electron 41 | Next.js 16 | React 19 | Tailwind 4 | Monaco Editor | xterm.js | Zustand 5 | IndexedDB | Turborepo | pnpm

## 개발

```bash
pnpm --filter noa-code-studio run dev:electron   # 개발
pnpm --filter noa-code-studio run verify:static  # 타입+린트
pnpm --filter noa-code-studio run test            # 테스트
pnpm --filter noa-code-studio run build:electron  # 빌드
```

## 라이선스

[CC BY-NC 4.0](LICENSE) — 저작자표시-비영리. 상업적 이용 불가.

자세한 내용은 [README.md](README.md) (English) 참조.
