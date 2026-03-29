/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChatRoom from './pages/ChatRoom';

export default function App() {
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] font-sans text-white">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/kitchen" element={
            <div className="flex justify-center h-[100dvh]">
              <div className="w-full max-w-5xl bg-[#121212] shadow-2xl relative overflow-hidden flex flex-col border-x border-[#333]">
                <Dashboard />
              </div>
            </div>
          } />
          <Route path="/:roomId" element={
            <div className="flex justify-center h-[100dvh]">
              <div className="w-full max-w-5xl bg-[#121212] shadow-2xl relative overflow-hidden flex flex-col border-x border-[#333]">
                <ChatRoom />
              </div>
            </div>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}