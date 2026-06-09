import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AppData, DEFAULT_SETTINGS, Settings as SettingsT } from '../domain/types';
import { downloadFile, todayIso } from '../utils';
import { clearAll } from '../storage/db';
import { CHANGELOG } from '../domain/changelog';

export function Settings() {
  const { data, dispatch } = useStore();
  const [s, setS] = useState<SettingsT>(data.settings);
  const fileInput = useRef<HTMLInputElement>(null);

  function save() {
    dispatch({ type: 'UPDATE_SETTINGS', settings: s });
    alert('設定を保存しました');
  }

  function resetSettings() {
    if (confirm('単位数・点数を制度標準値（518/379/342, 650/320/290）に戻します。よろしいですか？')) {
      setS(DEFAULT_SETTINGS);
    }
  }

  function exportJson() {
    const json = JSON.stringify(data, null, 2);
    downloadFile(`backup_${todayIso()}.json`, json, 'application/json');
  }

  function importJson() {
    fileInput.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as AppData;
      if (typeof parsed.schemaVersion !== 'number' || !Array.isArray(parsed.facilities)) {
        throw new Error('形式が正しくありません');
      }
      if (
        !confirm(
          '現在のデータを上書きします。事前に現データのバックアップを取ってから実行することを推奨します。続行しますか？'
        )
      ) {
        return;
      }
      dispatch({ type: 'REPLACE_ALL', data: parsed });
      alert('インポートしました');
    } catch (err) {
      alert('インポートに失敗しました: ' + (err as Error).message);
    } finally {
      e.target.value = '';
    }
  }

  async function fullReset() {
    if (
      !confirm(
        '全データを初期状態（ダミーデータ）に戻します。バックアップ済みであることを確認してください。'
      )
    )
      return;
    if (!confirm('本当によろしいですか？この操作は取り消せません。')) return;
    await clearAll();
    dispatch({ type: 'RESET' });
    alert('リセットしました');
  }

  return (
    <div>
      <div className="page-header">
        <h2>設定</h2>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">バックアップ・復元</div>
        </div>
        <div className="hstack">
          <button className="btn primary" onClick={exportJson}>
            JSONエクスポート
          </button>
          <button className="btn" onClick={importJson}>
            JSONインポート
          </button>
          <input
            type="file"
            accept=".json,application/json"
            ref={fileInput}
            onChange={onFile}
            style={{ display: 'none' }}
          />
        </div>
        <div className="alert info" style={{ marginTop: 10 }}>
          月初の請求作業後は必ずJSONエクスポートして、iPadの「ファイル」アプリ → iCloud Drive
          に保存してください。複数世代残しておくと安全です。
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">介護保険 単位数</div>
          <button className="btn small" onClick={resetSettings}>
            標準値に戻す
          </button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>単一建物 1人</label>
            <input
              type="number"
              value={s.kaigoUnits.single}
              onChange={(e) =>
                setS({ ...s, kaigoUnits: { ...s.kaigoUnits, single: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>2〜9人</label>
            <input
              type="number"
              value={s.kaigoUnits.group2to9}
              onChange={(e) =>
                setS({ ...s, kaigoUnits: { ...s.kaigoUnits, group2to9: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>10人以上</label>
            <input
              type="number"
              value={s.kaigoUnits.group10plus}
              onChange={(e) =>
                setS({ ...s, kaigoUnits: { ...s.kaigoUnits, group10plus: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>オンライン（参考）</label>
            <input
              type="number"
              value={s.kaigoUnits.online}
              onChange={(e) =>
                setS({ ...s, kaigoUnits: { ...s.kaigoUnits, online: Number(e.target.value) } })
              }
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">医療保険 点数</div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>単一建物 1人</label>
            <input
              type="number"
              value={s.iryoPoints.single}
              onChange={(e) =>
                setS({ ...s, iryoPoints: { ...s.iryoPoints, single: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>2〜9人</label>
            <input
              type="number"
              value={s.iryoPoints.group2to9}
              onChange={(e) =>
                setS({ ...s, iryoPoints: { ...s.iryoPoints, group2to9: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>10人以上</label>
            <input
              type="number"
              value={s.iryoPoints.group10plus}
              onChange={(e) =>
                setS({ ...s, iryoPoints: { ...s.iryoPoints, group10plus: Number(e.target.value) } })
              }
            />
          </div>
        </div>
      </div>

      <div className="hstack" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn primary" onClick={save}>
          設定を保存
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">更新履歴</div>
        </div>
        <div className="changelog">
          {CHANGELOG.map((entry, i) => (
            <div className="changelog-entry" key={i}>
              <div className="changelog-head">
                <span className="changelog-ver">{entry.version}</span>
                <span className="changelog-date">{entry.date}</span>
              </div>
              <ul className="changelog-list">
                {entry.changes.map((c, j) => (
                  <li key={j}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, borderColor: '#f09595' }}>
        <div className="card-head">
          <div className="name" style={{ color: 'var(--c-danger)' }}>
            危険ゾーン
          </div>
        </div>
        <div className="alert warn">
          全データを初期状態（ダミーデータ）に戻します。実行前に必ずJSONバックアップを取ってください。
        </div>
        <button className="btn danger" onClick={fullReset}>
          全データをリセット
        </button>
      </div>
    </div>
  );
}
