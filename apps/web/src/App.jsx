
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import AuthScreen from './screens/AuthScreen/AuthScreen';
import HomeScreen from './screens/HomeScreen/HomeScreen';
import ProductListScreen from './screens/ProductListScreen/ProductListScreen';
import ProductDetailScreen from './screens/ProductDetailScreen/ProductDetailScreen';
import CartScreen from './screens/CartScreen/CartScreen';
import CheckoutScreen from './screens/CheckoutScreen/CheckoutScreen';
import CategoriesScreen from './screens/CategoriesScreen/CategoriesScreen';
import OrdersScreen from './screens/OrdersScreen/OrdersScreen';
import OrderDetailScreen from './screens/OrderDetailScreen/OrderDetailScreen';
import OrderConfirmationScreen from './screens/OrderConfirmationScreen/OrderConfirmationScreen';
import ProfileScreen from './screens/ProfileScreen/ProfileScreen';
import EditProfileScreen from './screens/EditProfileScreen/EditProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen/NotificationsScreen';
import NotFoundScreen from './screens/NotFoundScreen/NotFoundScreen';
import RealtimeManager from './components/RealtimeManager';
import AddToHomePrompt from './components/AddToHomePrompt';
import OfflineBanner from './components/OfflineBanner/OfflineBanner';
import { useOnlineStatus } from './utils/connectivity';
import { useAuthStore } from './stores/authStore';

const AuthGuard = ({ children }) => {
  const token = useAuthStore((state) => state.token);
  const location = useLocation();
  if (!token) return <Navigate to="/auth" state={{ from: location }} replace />;
  return children;
};

export default function App() {
  const { online, retry } = useOnlineStatus();
  
  return (
    <BrowserRouter>
      <RealtimeManager />
      <AddToHomePrompt />
      <OfflineBanner
        visible={!online}
        message="Can't reach the server. Check your connection."
        onRetry={retry}
      />
      <Routes>
        {/* Main Tabs */}
        <Route path="/" element={<HomeScreen />} />
        <Route path="/categories" element={<CategoriesScreen />} />
        <Route path="/orders" element={<AuthGuard><OrdersScreen /></AuthGuard>} />
        <Route path="/profile" element={<AuthGuard><ProfileScreen /></AuthGuard>} />
        <Route path="/profile/edit" element={<AuthGuard><EditProfileScreen /></AuthGuard>} />

        {/* Stack Routes */}
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/products" element={<ProductListScreen />} />
        <Route path="/product/:id" element={<ProductDetailScreen />} />
        <Route path="/cart" element={<CartScreen />} />
        <Route path="/checkout" element={<AuthGuard><CheckoutScreen /></AuthGuard>} />
        <Route path="/order/:id" element={<AuthGuard><OrderDetailScreen /></AuthGuard>} />
        <Route path="/order-confirmation/:id" element={<AuthGuard><OrderConfirmationScreen /></AuthGuard>} />
        <Route path="/notifications" element={<AuthGuard><NotificationsScreen /></AuthGuard>} />
        
        {/* Fallback */}
        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
