import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function AdminLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-color)', minWidth: 0 }}>
        <Header />
        <main style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto', position: 'relative' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
