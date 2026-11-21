export type GraphErrorBody = {
  error: {
    code: string;
    message: string;
    innerError: {
      date: string;
      "request-id": string;
      "client-request-id": string;
    };
  };
};

export function graphError(
  code: string,
  message: string,
  clientRequestId?: string,
): GraphErrorBody {
  return {
    error: {
      code,
      message,
      innerError: {
        date: new Date().toISOString(),
        "request-id": crypto.randomUUID(),
        "client-request-id": clientRequestId ?? crypto.randomUUID(),
      },
    },
  };
}
