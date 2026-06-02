import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import { AuthProvider } from './components/AuthProvider';
import ProtectedRoute from './routes/ProtectedRoute';
import AdminLayout from './layout/AdminLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Combos from './pages/Combos';
import Categories from './pages/Categories';
import Offers from './pages/Offers';
import MobileDashboard from './pages/MobileDashboard';
import Customers from './pages/Customers';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Images from './pages/Images';
import Reports from './pages/Reports';
import Health from './pages/Health';
import AuditLogs from './pages/AuditLogs';
import BulkImport from './pages/BulkImport';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[Admin ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', maxWidth: '720px', margin: '4rem auto', color: 'var(--text-primary)' }}>
          <h1 style={{ marginBottom: '0.75rem' }}>Something went wrong</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            The admin page hit an unexpected rendering error. You can retry the page or go back to the dashboard.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-primary" onClick={() => window.location.reload()}>Retry</button>
            <button className="btn-secondary" onClick={() => { window.location.href = '/'; }}>Go to Dashboard</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AdminLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/combos" element={<Combos />} />
                  <Route path="/categories" element={<Categories />} />
                  <Route path="/offers" element={<Offers />} />
                  <Route path="/mobile-dashboard" element={<MobileDashboard />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/images" element={<Images />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/health" element={<Health />} />
                  <Route path="/audit" element={<AuditLogs />} />
                  <Route path="/bulk-import" element={<BulkImport />} />
                </Route>
              </Route>
            </Routes>
          </Router>
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
