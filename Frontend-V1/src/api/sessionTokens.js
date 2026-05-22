let customerTokenProvider = null;
let adminTokenProvider = null;

function setCustomerTokenProvider(provider) {
  customerTokenProvider = typeof provider === 'function' ? provider : null;
}

function setAdminTokenProvider(provider) {
  adminTokenProvider = typeof provider === 'function' ? provider : null;
}

async function resolveToken(provider) {
  if (!provider) return null;
  const token = await provider();
  return token || null;
}

function getCustomerToken() {
  return resolveToken(customerTokenProvider);
}

function getAdminToken() {
  return resolveToken(adminTokenProvider);
}

function clearTokenProviders() {
  customerTokenProvider = null;
  adminTokenProvider = null;
}

export {
  clearTokenProviders,
  getAdminToken,
  getCustomerToken,
  setAdminTokenProvider,
  setCustomerTokenProvider,
};
