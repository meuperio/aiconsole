/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ConsoleTab } from './components/ConsoleTab';
import { EvalTab } from './components/EvalTab';

export default function App() {
  const [activeTab, setActiveTab] = useState<'console' | 'eval'>('console');

  return (
    <div className="flex flex-col h-screen w-full bg-[#0D0D0E] text-[#D1D5DB] font-sans selection:bg-[#3B82F6]/30 overflow-hidden">
      {/* Header / Tab Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#262626] bg-[#111112]">
        <div className="flex items-center gap-4">
          <div className="h-6 w-6 bg-[#3B82F6] rounded flex items-center justify-center">
            <div className="h-3 w-3 border-2 border-white rounded-full"></div>
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-white uppercase">
            Claim Verification Console <span className="ml-2 px-1.5 py-0.5 bg-[#262626] text-[10px] text-[#A3A3A3] rounded">v1.0.4</span>
          </h1>
        </div>
        <nav className="flex gap-1 p-1 bg-black/40 rounded-lg">
          <button
            onClick={() => setActiveTab('console')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md shadow-sm transition-all ${
              activeTab === 'console'
                ? 'bg-[#262626] text-white'
                : 'text-[#737373] hover:text-white'
            }`}
          >
            Main Console
          </button>
          <button
            onClick={() => setActiveTab('eval')}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === 'eval'
                ? 'bg-[#262626] text-white shadow-sm'
                : 'text-[#737373] hover:text-white'
            }`}
          >
            Eval Mode
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'console' ? <ConsoleTab /> : <EvalTab />}
      </main>
    </div>
  );
}
