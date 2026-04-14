/**
 * Studio (소설) AI send/regenerate — minimal shell for Code Studio desktop.
 * Full HFCP stack is mocked in tests; production wiring may extend this module.
 */
import { useCallback, useState } from "react";

export interface UseStudioAIParams {
  currentSession: unknown;
  currentSessionId: string;
  setSessions: (fn: unknown) => void;
  updateCurrentSession: (fn: unknown) => void;
  hfcpState: unknown;
  promptDirective: string;
  language: string;
  canvasPass: number;
  setCanvasContent: (v: unknown) => void;
  setWritingMode: (v: unknown) => void;
  setShowApiKeyModal: (v: boolean) => void;
  setUxError: (e: unknown) => void;
}

export function useStudioAI(_params: UseStudioAIParams) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSend = useCallback(async () => {
    // Story generation is not available in Code Studio desktop.
    // This hook exists for the narrative engine module (소설 엔진) which
    // is not wired in the current desktop build. The full HFCP pipeline
    // will be connected when the narrative workspace is activated.
    _params.setUxError?.({ message: "Story generation is not available in this build." });
  }, [_params]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
  }, []);

  const handleRegenerate = useCallback(async () => {
    _params.setUxError?.({ message: "Story regeneration is not available in this build." });
  }, [_params]);

  return {
    isGenerating,
    lastReport: null,
    directorReport: null,
    handleSend,
    handleCancel,
    handleRegenerate,
  };
}
