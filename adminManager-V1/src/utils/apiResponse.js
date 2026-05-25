export function readList(payload, keys = []) {
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.data,
    payload?.items,
    payload?.results,
    ...keys.map(key => payload?.[key]),
    ...keys.map(key => payload?.data?.[key]),
  ];

  return candidates.find(Array.isArray) || [];
}
