import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { Loading } from '../components/SharedUI';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
