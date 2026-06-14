let customerTokenProvider = null;

function setCustomerTokenProvider(provider) {
  customerTokenProvider = typeof provider === 'function' ? provider : null;
}

async function resolveToken(provider) {
  if (!provider) return null;
  const token = await provider();
  return token || null;
}

function getCustomerToken() {
  return resolveToken(customerTokenProvider);
}

function clearTokenProviders() {
  customerTokenProvider = null;
}

export {
  clearTokenProviders,
  getCustomerToken,
  setCustomerTokenProvider,
};
