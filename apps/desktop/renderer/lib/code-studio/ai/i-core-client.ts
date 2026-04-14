// ============================================================
// PART 1 — I-Core Client Interface
// ============================================================

import type { ICoreRequest, ICoreResponse, CodeChunk } from "./i-core-worker";
import { createICoreWorker } from '@/lib/code-studio/ai/worker-loader';

class ICoreClient {
  private worker: Worker | null = null;
  private reqIdCounter = 0;
  private pendingRequests: Map<number, { resolve: (res: unknown) => void; reject: (err: unknown) => void }> = new Map();

  // Lazy initialize the worker
  private getWorker(): Worker {
    if (typeof window === 'undefined') {
      throw new Error("ICoreClient can only be used in the browser");
    }
    if (!this.worker) {
      this.worker = createICoreWorker();
      this.worker.onmessage = this.handleMessage.bind(this);
    }
    return this.worker;
  }

  private handleMessage(e: MessageEvent<ICoreResponse>) {
    const { type, reqId, results, error } = e.data;
    if (reqId !== undefined && this.pendingRequests.has(reqId)) {
      const { resolve, reject } = this.pendingRequests.get(reqId)!;
      this.pendingRequests.delete(reqId);
      
      if (type === 'ICORE_ERROR') {
        reject(new Error(error || 'I-Core execution error'));
      } else {
        // Return context for SEARCH_SUCCESS, otherwise void
        resolve(type === 'SEARCH_SUCCESS' ? results : undefined);
      }
    }
  }

  private sendRequest<T>(req: Omit<ICoreRequest, 'reqId'>): Promise<T> {
    return new Promise((resolve, reject) => {
      const reqId = ++this.reqIdCounter;
      this.pendingRequests.set(reqId, {
        resolve: resolve as (res: unknown) => void,
        reject: reject as (err: unknown) => void,
      });
      try {
        this.getWorker().postMessage({ ...req, reqId });
      } catch (err) {
        this.pendingRequests.delete(reqId);
        reject(err);
      }
    });
  }

  // ============================================================
  // PART 2 — Public API
  // ============================================================

  public async indexFile(filePath: string, codeSnippet: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.sendRequest({
      type: 'INDEX_FILE',
      payload: { filePath, codeSnippet, metadata }
    });
  }

  public async searchContext(query: string, topK: number = 5): Promise<CodeChunk[]> {
    return await this.sendRequest<CodeChunk[]>({
      type: 'SEARCH_CONTEXT',
      payload: { query, topK }
    });
  }

  public async clearIndex(): Promise<void> {
    await this.sendRequest({
      type: 'CLEAR_INDEX',
      payload: {}
    });
  }
}

export const iCoreClient = new ICoreClient();

// IDENTITY_SEAL: PART-1,2 | role=ICoreClient | inputs=Requests | outputs=Responses
