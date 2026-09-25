import { ADDRESS_MAX_LENGTH, formatAddress, tidyAddressInput } from '../src/utils/address';

describe('address formatting', () => {
  it('keeps typing smooth: no line breaks, no double spaces, trailing space allowed', () => {
    expect(tidyAddressInput('  House 12\n\nNear  Temple ')).toBe('House 12 Near Temple ');
  });

  it('caps the address at 100 characters', () => {
    expect(ADDRESS_MAX_LENGTH).toBe(100);
    expect(tidyAddressInput('a'.repeat(150))).toHaveLength(100);
    expect(formatAddress('b'.repeat(150))).toHaveLength(100);
  });

  it('formats the final address with clean commas', () => {
    expect(formatAddress(' House 12 ,near temple,, Main Road , ')).toBe('House 12, near temple, Main Road');
    expect(formatAddress(',, ')).toBe('');
    expect(formatAddress(null)).toBe('');
  });
});
