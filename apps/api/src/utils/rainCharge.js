function calculateRainCharge(settings = {}) {
  if (!settings || !settings.rain_charge_enabled) return 0;
  const charge = Number(settings.rain_charge);
  return Number.isFinite(charge) && charge > 0 ? charge : 0;
}

module.exports = {
  calculateRainCharge,
};
