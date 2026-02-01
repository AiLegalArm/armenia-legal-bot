export function getFunctionsInvokeErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Unknown error";

  const anyErr = error as any;
  const body = anyErr?.context?.body;

  // supabase-js FunctionInvokeError often contains `context.body` with JSON string.
  if (typeof body === "string" && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
      if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
    } catch {
      // ignore
    }
  }

  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message;
  return "Unknown error";
}

export function isNoDataForExtractionMessage(msg: string): boolean {
  return msg.toLowerCase().includes("no data available");
}
