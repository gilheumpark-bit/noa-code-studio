// ============================================================
// PART 1 — Types & Interfaces
// ============================================================

export interface ICoreRequest {
  type: 'INDEX_FILE' | 'SEARCH_CONTEXT' | 'CLEAR_INDEX';
  payload: {
    filePath?: string;
    codeSnippet?: string;
    metadata?: Record<string, unknown>;
    query?: string;
    topK?: number;
  };
  reqId?: number;
}

export interface ICoreResponse {
  type: 'INDEX_SUCCESS' | 'SEARCH_SUCCESS' | 'ICORE_ERROR';
  reqId?: number;
  results?: unknown[];
  error?: string;
}

export interface CodeChunk {
  filePath: string;
  chunkId: string;
  codeSnippet: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

// ============================================================
// PART 2 — DB & Vector Storage (IndexedDB Mock for SQLite-vss)
// ============================================================
const VECTOR_DIMENSIONS = 384; // all-MiniLM-L6-v2 size
let vectordb: CodeChunk[] = []; // In-memory fallback if IDB fails.

// 코사인 유사도 연산 함수 (SIMD-optimized concept)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// PART 3 — Transformers.js Pipeline Loader (Mocked for safety)
// ============================================================
type ExtractorResult = { tolist: () => number[][] };
type PipelineExtractor = (text: string, opts?: { pooling?: string; normalize?: boolean }) => Promise<ExtractorResult> | ExtractorResult;
let pipelineExtractor: PipelineExtractor | null = null;

async function initExtractor(): Promise<PipelineExtractor> {
  if (pipelineExtractor) return pipelineExtractor;
  
  // @xenova/transformers 로드 (동적 로딩 시뮬레이션)
  // WebGPU/WASM 환경에서 로컬 임베딩 모델 로드
  try {
    // @ts-ignore — optional dep, suppress webpack static analysis
    const moduleName = '@xenova/' + 'transformers';
    const { pipeline, env } = await import(/* webpackIgnore: true */ moduleName).catch(() => ({
      pipeline: async () => ((_text: string) => ({ tolist: () => new Array(VECTOR_DIMENSIONS).fill(Math.random()) })),
      env: { allowLocalModels: true, useBrowserCache: true }
    }));
    
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    
    // Feature Extraction Pipeline 생성 (all-MiniLM-L6-v2)
    pipelineExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
  } catch (error) {
    console.warn("[I-Core] transformers.js load failed, using mock extractor", error);
    pipelineExtractor = async (_text: string) => ({ tolist: () => new Array(VECTOR_DIMENSIONS).fill(Math.random()) });
  }
  return pipelineExtractor!;
}

// ============================================================
// PART 4 — Message Handler (Effect Boundary)
// ============================================================

self.onmessage = async (e: MessageEvent<ICoreRequest>) => {
  const { type, payload, reqId } = e.data;

  try {
    if (type === 'INDEX_FILE') {
      const extractor = await initExtractor();
      const output = await extractor(payload.codeSnippet!, { pooling: 'mean', normalize: true });
      const embedding = output.tolist()[0];

      vectordb.push({
        filePath: payload.filePath!,
        chunkId: `${payload.filePath}-${Date.now()}`,
        codeSnippet: payload.codeSnippet!,
        embedding,
        metadata: payload.metadata
      });
      
      self.postMessage({ type: 'INDEX_SUCCESS', reqId });
    } 
    else if (type === 'SEARCH_CONTEXT') {
      const extractor = await initExtractor();
      const output = await extractor(payload.query!, { pooling: 'mean', normalize: true });
      const queryEmbedding = output.tolist()[0];
      
      // Compute similarities
      const scored = vectordb.map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding!)
      })).sort((a, b) => b.score - a.score);
      
      // Top K Returns
      const topK = scored.slice(0, payload.topK || 5);
      
      self.postMessage({ type: 'SEARCH_SUCCESS', reqId, results: topK });
    }
    else if (type === 'CLEAR_INDEX') {
      vectordb = [];
      self.postMessage({ type: 'INDEX_SUCCESS', reqId });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'ICORE_ERROR', reqId, error: errorMessage });
  }
};

// IDENTITY_SEAL: PART-4 | role=i-core-worker | inputs=ICoreRequest | outputs=ICoreResponse
