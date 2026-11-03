/** Erros de domínio. A camada de API traduz para códigos HTTP/tRPC. */
export class DomainError extends Error {
  constructor(
    public code: 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export const forbidden = (msg = 'Sem permissão para esta ação.') => new DomainError('FORBIDDEN', msg);
export const notFound = (msg = 'Registro não encontrado.') => new DomainError('NOT_FOUND', msg);
export const badRequest = (msg: string) => new DomainError('BAD_REQUEST', msg);
export const conflict = (msg: string) => new DomainError('CONFLICT', msg);

export function must<T>(v: T | undefined | null, msg?: string): T {
  if (v === undefined || v === null) throw notFound(msg);
  return v;
}
