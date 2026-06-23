import { uuidv4 } from '../src/utils/uuid';

describe('uuidv4', () => {
  it('returns a string in v4 format', () => {
    const id = uuidv4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns unique values on repeated calls', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i += 1) ids.add(uuidv4());
    expect(ids.size).toBe(100);
  });

  it('returns a string of the correct length', () => {
    expect(uuidv4().length).toBe(36);
  });
});
