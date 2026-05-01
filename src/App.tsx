import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Dashboard } from './features/Dashboard';
import { Facilities } from './features/Facilities';
import { Patients } from './features/Patients';
import { Visits } from './features/Visits';
import { Events } from './features/Events';
import { Results } from './features/Results';
import { Settings } from './features/Settings';

type Tab = 'dashboard' | 'facilities' | 'patients' | 'visits' | 'events' | 'results' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'visits', label: '月別訪問登録' },
  { id: 'results', label: '計算結果' },
  { id: 'patients', label: '患者一覧' },
  { id: 'facilities', label: '施設一覧' },
  { id: 'events', label: '入退院・移動' },
  { id: 'settings', label: '設定' },
];

function AppShell() {
  const [tab, setTab] = useState<Tab>('visits');
  const { loaded } = useStore();

  if (!loaded) {
    return (
      <div className="app">
        <div className="app-main" style={{ textAlign: 'center', paddingTop: 60 }}>
          <p>データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="app-title">施設点数管理 — 居宅療養管理指導費 計算アプリ</div>
        <nav className="app-nav">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'facilities' && <Facilities />}
        {tab === 'patients' && <Patients />}
        {tab === 'visits' && <Visits />}
        {tab === 'events' && <Events />}
        {tab === 'results' && <Results />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
