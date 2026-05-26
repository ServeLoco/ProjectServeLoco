const roundMoney = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
};

const toMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundMoney(numeric) : fallback;
};

module.exports = {
  roundMoney,
  toMoney,
};
