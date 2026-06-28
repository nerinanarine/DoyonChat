import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get, post, del, put, ApiError } from '../../src/services/api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('get should make GET request and return JSON', async () => {
    const mockData = { id: '1', name: 'test' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
      text: () => Promise.resolve(''),
    });

    const result = await get('/test');

    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('post should make POST request with body', async () => {
    const mockBody = { message: 'hello' };
    const mockResponse = { id: '1' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
      text: () => Promise.resolve(''),
    });

    const result = await post('/test', mockBody);

    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(mockBody),
      }),
    );
  });

  it('delete should make DELETE request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    });

    const result = await del('/test/1');

    expect(result).toEqual({});
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test/1'),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('put should make PUT request with body', async () => {
    const mockBody = { name: 'updated' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', ...mockBody }),
      text: () => Promise.resolve(''),
    });

    const result = await put('/test/1', mockBody);

    expect(result).toEqual({ id: '1', name: 'updated' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/test/1'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(mockBody),
      }),
    );
  });

  it('should throw ApiError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad Request'),
    });

    await expect(get('/bad')).rejects.toThrow(ApiError);
  });
});
