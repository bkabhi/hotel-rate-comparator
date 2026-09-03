/**
 * Integration tests for the mock supplier APIs — every simulated behaviour the
 * workflow tests rely on has to actually be reachable over HTTP.
 */
import request from 'supertest';
import type { Express } from 'express';
import { createSupplierApp } from '../../src/suppliers/app';
import { behaviorRegistry, flakyLedger } from '../../src/suppliers/behavior';
import type { SupplierHotelsResponse } from '../../src/shared/types';

const QUERY = { city: 'Mumbai', checkIn: '2026-05-01', checkOut: '2026-05-04' };

let app: Express;

beforeEach(() => {
  behaviorRegistry.reset();
  flakyLedger.reset();
  app = createSupplierApp();
});

describe('supplier endpoints', () => {
  it('returns hotels with hotelId, name and price in rupees for Supplier A', async () => {
    const res = await request(app).get('/supplierA/hotels').query(QUERY).expect(200);
    const body = res.body as SupplierHotelsResponse;

    expect(body.supplier).toBe('A');
    expect(body.nights).toBe(3);
    expect(body.hotels.length).toBeGreaterThan(0);
    for (const hotel of body.hotels) {
      expect(hotel).toEqual(
        expect.objectContaining({
          hotelId: expect.any(String),
          name: expect.any(String),
          price: expect.any(Number),
        }),
      );
      expect(hotel.price).toBeGreaterThan(0);
      expect(hotel.currency).toBe('INR');
    }
  });

  it('serves both suppliers with overlapping but differently priced inventory', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/supplierA/hotels').query(QUERY).expect(200),
      request(app).get('/supplierB/hotels').query(QUERY).expect(200),
    ]);

    const priceA = new Map<string, number>(
      (a.body as SupplierHotelsResponse).hotels.map((h) => [h.hotelId, h.price]),
    );
    const shared = (b.body as SupplierHotelsResponse).hotels.filter((h) => priceA.has(h.hotelId));

    expect(shared.length).toBeGreaterThan(0);
    expect(shared.some((h) => h.price !== priceA.get(h.hotelId))).toBe(true);
  });

  it('prices the whole stay, scaling with the number of nights', async () => {
    const threeNights = await request(app).get('/supplierA/hotels').query(QUERY).expect(200);
    const sixNights = await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, checkOut: '2026-05-07' })
      .expect(200);

    const first = (threeNights.body as SupplierHotelsResponse).hotels[0]!;
    const second = (sixNights.body as SupplierHotelsResponse).hotels[0]!;
    expect(second.price).toBeCloseTo(first.price * 2, 2);
  });

  it('rejects a request missing its query parameters', async () => {
    await request(app).get('/supplierA/hotels').expect(400);
    await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, checkOut: QUERY.checkIn })
      .expect(400);
  });

  it('returns an empty hotel list for a city it does not cover', async () => {
    const res = await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, city: 'Shimla' })
      .expect(200);
    expect((res.body as SupplierHotelsResponse).hotels).toEqual([]);
  });
});

describe('simulated behaviours', () => {
  it('returns a server error on demand', async () => {
    const res = await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, behavior: 'error:500' })
      .expect(500);
    expect(res.body.error).toMatch(/unavailable/i);
  });

  it('returns an empty list on demand', async () => {
    const res = await request(app)
      .get('/supplierB/hotels')
      .query({ ...QUERY, behavior: 'empty' })
      .expect(200);
    expect((res.body as SupplierHotelsResponse).hotels).toEqual([]);
  });

  it('delays a slow response past the workflow deadline', async () => {
    const started = Date.now();
    await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, behavior: 'slow:600' })
      .expect(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
  });

  it('fails a fixed number of times per search key, then recovers', async () => {
    const call = () =>
      request(app)
        .get('/supplierA/hotels')
        .query({ ...QUERY, behavior: 'flaky:2', key: 'search-1' });

    expect((await call()).status).toBe(503);
    expect((await call()).status).toBe(503);
    expect((await call()).status).toBe(200);
  });

  it('keeps flaky counters separate per search key', async () => {
    const first = await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, behavior: 'flaky:1', key: 'search-1' });
    const other = await request(app)
      .get('/supplierA/hotels')
      .query({ ...QUERY, behavior: 'flaky:1', key: 'search-2' });

    expect(first.status).toBe(503);
    expect(other.status).toBe(503); // a different search starts its own count
  });

  it('applies server-wide defaults set through the control endpoint', async () => {
    await request(app).post('/__mock/config').send({ B: { kind: 'error', status: 502 } }).expect(200);
    await request(app).get('/supplierB/hotels').query(QUERY).expect(502);
    await request(app).get('/supplierA/hotels').query(QUERY).expect(200);

    await request(app).post('/__mock/reset').expect(200);
    await request(app).get('/supplierB/hotels').query(QUERY).expect(200);
  });

  it('rejects an unknown behaviour on the control endpoint', async () => {
    await request(app).post('/__mock/config').send({ A: { kind: 'nonsense' } }).expect(400);
  });
});
