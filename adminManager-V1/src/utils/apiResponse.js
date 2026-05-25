export function readList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  const listKeys = Array.isArray(keys) ? keys : [keys].filter(Boolean);

  const candidates = [
    payload?.data,
    payload?.items,
    payload?.results,
    ...listKeys.map(key => payload?.[key]),
    ...listKeys.map(key => payload?.data?.[key]),
  ];

  return candidates.find(Array.isArray) || [];
}
