import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../client';

// ---------------------------------------------------------------------------
// In test env (jsdom, non-PROD) BASE_URL resolves to 'http://localhost:8082'
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:8082';

/** Helper — create a minimal Response-like object for the fetch mock. */
function mockResponse(body: unknown, init: { status?: number; ok?: boolean; headers?: Record<string, string> } = {}) {
  const { status = 200, ok = status >= 200 && status < 300 } = init;
  const isJson = typeof body === 'object' && body !== null;
  const text = isJson ? JSON.stringify(body) : String(body ?? '');

  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// ApiError
// ===========================================================================
describe('ApiError', () => {
  it('sets status and message from constructor args', () => {
    const err = new ApiError(404, 'Not Found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
  });

  it('has name "ApiError"', () => {
    const err = new ApiError(500, 'Server Error');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(400, 'Bad Request');
    expect(err).toBeInstanceOf(Error);
  });
});

// ===========================================================================
// apiGet
// ===========================================================================
describe('apiGet', () => {
  it('sends GET request and parses JSON response', async () => {
    const data = { id: 1, name: 'test' };
    fetchMock.mockResolvedValueOnce(mockResponse(data));

    const result = await apiGet('/items/1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/items/1`,
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(result).toEqual(data);
  });

  it('throws ApiError with JSON body on 404', async () => {
    const errorBody = { detail: 'Item not found' };
    fetchMock.mockResolvedValueOnce(mockResponse(errorBody, { status: 404 }));

    await expect(apiGet('/items/999')).rejects.toThrow(ApiError);
    await fetchMock.mockResolvedValueOnce(mockResponse(errorBody, { status: 404 }));

    try {
      await apiGet('/items/999');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(404);
      expect(err.message).toContain('Item not found');
    }
  });

  it('throws ApiError with text body on 500 with non-JSON response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse('Internal Server Error', { status: 500 }));

    try {
      await apiGet('/crash');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(500);
      expect(err.message).toBe('Internal Server Error');
    }
  });
});

// ===========================================================================
// apiPost
// ===========================================================================
describe('apiPost', () => {
  it('sends POST with JSON body and returns parsed response', async () => {
    const payload = { title: 'new item' };
    const response = { id: 42, title: 'new item' };
    fetchMock.mockResolvedValueOnce(mockResponse(response));

    const result = await apiPost('/items', payload);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/items`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual(response);
  });

  it('sends POST with null body as stringified null', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));

    await apiPost('/action', null);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/action`,
      expect.objectContaining({
        body: 'null',
      }),
    );
  });

  it('throws ApiError on 422 validation error', async () => {
    const validationErr = { errors: [{ field: 'title', message: 'required' }] };
    fetchMock.mockResolvedValueOnce(mockResponse(validationErr, { status: 422 }));

    await expect(apiPost('/items', {})).rejects.toThrow(ApiError);

    fetchMock.mockResolvedValueOnce(mockResponse(validationErr, { status: 422 }));
    try {
      await apiPost('/items', {});
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(422);
      expect(err.message).toContain('title');
    }
  });
});

// ===========================================================================
// apiPatch
// ===========================================================================
describe('apiPatch', () => {
  it('sends PATCH with JSON body and returns parsed response', async () => {
    const payload = { name: 'updated' };
    const response = { id: 1, name: 'updated' };
    fetchMock.mockResolvedValueOnce(mockResponse(response));

    const result = await apiPatch('/items/1', payload);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/items/1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual(response);
  });

  it('throws ApiError on 401 Unauthorized', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse('Unauthorized', { status: 401 }));

    await expect(apiPatch('/items/1', { name: 'x' })).rejects.toThrow(ApiError);

    fetchMock.mockResolvedValueOnce(mockResponse('Unauthorized', { status: 401 }));
    try {
      await apiPatch('/items/1', { name: 'x' });
    } catch (e) {
      expect((e as ApiError).status).toBe(401);
    }
  });
});

// ===========================================================================
// apiDelete
// ===========================================================================
describe('apiDelete', () => {
  it('sends DELETE and returns parsed response', async () => {
    const response = { deleted: true };
    fetchMock.mockResolvedValueOnce(mockResponse(response));

    const result = await apiDelete('/items/1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/items/1`,
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
    expect(result).toEqual(response);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(null, { status: 204 }));

    const result = await apiDelete('/items/1');

    expect(result).toBeUndefined();
  });
});
