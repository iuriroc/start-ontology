export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string, id: string) =>
  new AppError(404, `${resource.toUpperCase()}_NOT_FOUND`, `${resource} ${id} not found`);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export const badRequest = (code: string, message: string) => new AppError(400, code, message);

export const unauthorized = (code: string, message: string) => new AppError(401, code, message);

export const forbidden = (code: string, message: string) => new AppError(403, code, message);
