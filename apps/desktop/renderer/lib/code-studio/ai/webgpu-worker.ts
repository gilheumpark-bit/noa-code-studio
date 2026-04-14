// ============================================================
// PART 1 — V-Core WebGPU Isolation Worker
// ============================================================
// This worker isolates the FIM (Fill-In-the-Middle) prediction logic from the main UI thread.
// It tries to use local WebGPU (like WebLLM) and falls back safely to messaging if not available.

/// <reference lib="webworker" />

let isModelLoaded = false;
let isHardwareSupported = false;

// Initialize the worker and check hardware capabilities
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    try {
      // Hardware sniffing for Graceful Degradation (NOA-EXEC Preflight Rule)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu as
        | { requestAdapter(): Promise<{ limits: { maxBufferSize: number } } | null> }
        | undefined;
      if (!gpu) {
        throw new Error('WebGPU is not supported in this environment.');
      }

      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        throw new Error('No appropriate GPU adapter found.');
      }

      // Check VRAM limits: fallback if less than 2GB (roughly 2147483648 bytes)
      // Note: adapter.limits.maxBufferSize or similar limits can proxy VRAM checks,
      // though true VRAM capacity isn't fully exposed via WebGPU spec yet.
      // We simulate a strict threshold check here.
      const maxBufferSize = adapter.limits.maxBufferSize;
      if (maxBufferSize < 256 * 1024 * 1024) { // Minimum threshold test
        throw new Error('GPU bounds are too low (VRAM threshold failed). Fallback to Cloud API.');
      }

      isHardwareSupported = true;

      // WebLLM model loading requires @mlc-ai/web-llm which is not bundled
      // in the current desktop build. When the dependency is added, uncomment:
      //   const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      //   engine = await CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
      //   isModelLoaded = true;
      //
      // Until then, all FIM requests gracefully fall back to cloud API.
      isModelLoaded = false;

      self.postMessage({ type: 'INIT_SUCCESS', isLocalGPU: false });

    } catch (err) {
      console.warn('[V-Core Worker] Initialization failed, falling back to cloud:', err);
      self.postMessage({ type: 'INIT_ERROR', error: String(err) });
    }
    return;
  }

  if (type === 'FIM_REQUEST') {
    // eslint-disable-next-line unused-imports/no-unused-vars
    const { codeBefore, codeAfter, language, reqId } = payload;
    
    if (!isModelLoaded || !isHardwareSupported) {
      // Graceful Degradation: tell main thread to use network
      self.postMessage({ type: 'FIM_FALLBACK', reqId });
      return;
    }

    // Speculative Caching: Mock inference step with hardware
    // In production, this runs actual TVM/WebGPU forward pass.
    try {
      // Mock fast 100ms response time
      await new Promise(res => setTimeout(res, 100));
      
      // We don't have the actual WebLLM running in this mock, so we trigger fallback
      // but in real code, we would stream/post the result back.
      // E.g. const completion = await engine.chat.completions.create({...})
      // self.postMessage({ type: 'FIM_SUCCESS', reqId, completion: "..." });

      self.postMessage({ type: 'FIM_FALLBACK', reqId }); // Mocking fallback for now as we lack actual engine
    } catch {
      self.postMessage({ type: 'FIM_FALLBACK', reqId });
    }
  }
});

// IDENTITY_SEAL: PART-1 | role=webgpu-worker | inputs=MessageEvents | outputs=Hardware Sniffing & Prediction
