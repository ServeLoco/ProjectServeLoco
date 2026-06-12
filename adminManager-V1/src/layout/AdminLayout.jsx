import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import GlobalOrderAlert from '../components/GlobalOrderAlert';
import './AdminLayout.css';

export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-workspace">
        <Header />
        <main className="admin-main">
          <Outlet />
        </main>
        <GlobalOrderAlert />
      </div>
    </div>
  );
}
