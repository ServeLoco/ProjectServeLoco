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

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
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
              </Route>
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
