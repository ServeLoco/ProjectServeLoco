const dashboardLogo = require('../../Images/villkro-dashboard-logo.png');
const loginLogo = require('../../Images/villkro-login-logo.png');
const authBg = require('../../Images/auth-bg.png');

// appLogo is kept for backward compatibility (legacy imports). It points at
// the dashboard logo since that is the "primary" app surface.
const appLogo = dashboardLogo;

export { appLogo, dashboardLogo, loginLogo, authBg };
export default appLogo;
