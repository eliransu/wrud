/** Structured error shape shared by every route. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const errorBody = (e: AppError) => ({
  error: { code: e.code, message: e.message, details: e.details },
});

/**
 * Project zod issues to safe { path, message } pairs for the 400 body - avoids echoing
 * received values or internal zod type names back to the caller.
 */
export const zodIssues = (
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) => issues.map((i) => ({ path: i.path.join("."), message: i.message }));
