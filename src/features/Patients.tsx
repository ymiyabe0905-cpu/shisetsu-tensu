import { useState } from 'react';
import { InsuranceKind, Patient, PatientStatus } from '../domain/types';
import { useStore, makeId } from '../state/store';
import { Modal } from '../components/Modal';

const INSURANCE: InsuranceKind[] = ['介護', '介護予防', '医療', '対象外'];
const STATUS: PatientStatus[] = ['訪問対象', '入院中', '退院予定', '終了', '死亡', '一時停止'];

export function Patients() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Patient | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [filterFac, setFilterFac] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterIns, setFilterIns] = useState('');
  const [searchText, setSearchText] = useState('');

  const filtered = data.patients
    .filter((p) => showHidden || !p.hidden)
    .filter((p) => !filterFac || p.facilityId === filterFac)
    .filter((p) => !filterStatus || p.status === filterStatus)
    .filter((p) => !filterIns || p.insurance === filterIns)
    .filter(
      (p) => !searchText || p.name.includes(searchText) || (p.kana ?? '').includes(searchText)
    );

  function newPatient(): Patient {
    return {
      id: makeId('p'),
      name: '',
      facilityId: data.facilities[0]?.id ?? '',
      insurance: '介護',
      status: '訪問対象',
    };
  }

  function deleteHandler(p: Patient) {
    setDeleteTarget(p);
  }
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleteMode, setDeleteMode] = useState<'hide' | 'remove'>('hide');

  function executeDelete() {
    if (!deleteTarget) return;
    dispatch({ type: 'DELETE_PATIENT', id: deleteTarget.id, mode: deleteMode });
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="page-header">
        <h2>患者一覧</h2>
        <button className="btn primary" onClick={() => setEditing(newPatient())}>
          ＋ 患者を追加
        </button>
      </div>

      <div className="hstack" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="患者名・フリガナで検索"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={filterFac} onChange={(e) => setFilterFac(e.target.value)} style={{ width: 'auto' }}>
          <option value="">全施設</option>
          {data.facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">全状態</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={filterIns} onChange={(e) => setFilterIns(e.target.value)} style={{ width: 'auto' }}>
          <option value="">全保険</option>
          {INSURANCE.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <label className="hstack" style={{ fontSize: 12 }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          非表示も表示
        </label>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>患者名</th>
              <th>施設</th>
              <th>ユニット</th>
              <th>保険</th>
              <th>状態</th>
              <th>開始日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>
                  患者が登録されていません
                </td>
              </tr>
            )}
            {filtered.map((p) => {
              const fac = data.facilities.find((f) => f.id === p.facilityId);
              const unit = fac?.units.find((u) => u.id === p.unitId);
              return (
                <tr key={p.id} style={{ opacity: p.hidden ? 0.5 : 1 }}>
                  <td>
                    <div className="nm">{p.name}</div>
                    <div className="kn">{p.kana ?? '—'}</div>
                  </td>
                  <td>{fac?.name ?? '—'}</td>
                  <td>{unit?.name ?? '—'}</td>
                  <td>
                    <span className={`tag tag-${insuranceClass(p.insurance)}`}>{p.insurance}</span>
                  </td>
                  <td>
                    <span className={`tag tag-${statusClass(p.status)}`}>{p.status}</span>
                    {p.hidden && (
                      <span className="tag tag-end" style={{ marginLeft: 4 }}>
                        非表示
                      </span>
                    )}
                  </td>
                  <td>{p.startDate ?? '—'}</td>
                  <td className="hstack" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn small" onClick={() => setEditing(p)}>
                      編集
                    </button>
                    {p.hidden ? (
                      <button
                        className="btn small"
                        onClick={() => dispatch({ type: 'TOGGLE_PATIENT_HIDDEN', id: p.id })}
                      >
                        表示に戻す
                      </button>
                    ) : (
                      <button className="btn small danger" onClick={() => deleteHandler(p)}>
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <PatientForm patient={editing} onClose={() => setEditing(null)} />}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title={`${deleteTarget.name} を削除`}
          footer={
            <>
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                キャンセル
              </button>
              <button className="btn danger" onClick={executeDelete}>
                実行
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            削除方法を選択してください。どちらの場合も過去の訪問記録は残ります。
          </p>
          <label
            style={{
              display: 'flex',
              gap: 8,
              padding: 10,
              border: '1px solid var(--c-border)',
              borderRadius: 6,
              marginBottom: 6,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              checked={deleteMode === 'hide'}
              onChange={() => setDeleteMode('hide')}
              style={{ width: 'auto' }}
            />
            <div>
              <strong style={{ fontSize: 13 }}>非表示にする（推奨）</strong>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)', marginTop: 2 }}>
                後で「表示に戻す」で復元できます
              </div>
            </div>
          </label>
          <label
            style={{
              display: 'flex',
              gap: 8,
              padding: 10,
              border: '1px solid var(--c-border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              checked={deleteMode === 'remove'}
              onChange={() => setDeleteMode('remove')}
              style={{ width: 'auto' }}
            />
            <div>
              <strong style={{ fontSize: 13 }}>完全に削除する</strong>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)', marginTop: 2 }}>
                患者情報は元に戻せません
              </div>
            </div>
          </label>
        </Modal>
      )}
    </div>
  );
}

function insuranceClass(i: InsuranceKind): string {
  switch (i) {
    case '介護':
      return 'kaigo';
    case '介護予防':
      return 'yobo';
    case '医療':
      return 'iryo';
    case '対象外':
      return 'none';
  }
}

function statusClass(s: PatientStatus): string {
  switch (s) {
    case '訪問対象':
      return 'new';
    case '入院中':
      return 'status';
    case '退院予定':
      return 'info';
    default:
      return 'end';
  }
}

interface FormProps {
  patient: Patient;
  onClose: () => void;
}

function PatientForm({ patient, onClose }: FormProps) {
  const { data, dispatch } = useStore();
  const [p, setP] = useState<Patient>(patient);
  const fac = data.facilities.find((f) => f.id === p.facilityId);

  function save() {
    if (!p.name.trim()) {
      alert('患者名を入力してください');
      return;
    }
    if (!p.facilityId) {
      alert('施設を選択してください');
      return;
    }
    dispatch({ type: 'UPSERT_PATIENT', patient: { ...p, name: p.name.trim() } });
    onClose();
  }

  const startsThisMonth = (() => {
    if (!p.startDate) return false;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return p.startDate.startsWith(ym);
  })();

  return (
    <Modal
      open
      onClose={onClose}
      title={patient.name ? `患者の編集: ${patient.name}` : '患者の追加'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>
            患者名<span className="req">＊</span>
          </label>
          <input type="text" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </div>
        <div className="field">
          <label>フリガナ</label>
          <input
            type="text"
            value={p.kana ?? ''}
            onChange={(e) => setP({ ...p, kana: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label>
            施設<span className="req">＊</span>
          </label>
          <select
            value={p.facilityId}
            onChange={(e) => setP({ ...p, facilityId: e.target.value, unitId: undefined })}
          >
            <option value="">—</option>
            {data.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>ユニット・棟</label>
          <select
            value={p.unitId ?? ''}
            onChange={(e) => setP({ ...p, unitId: e.target.value || undefined })}
            disabled={!fac || fac.units.length === 0}
          >
            <option value="">—</option>
            {fac?.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.separateBuilding ? '（別建物）' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field full">
          <label>
            保険区分<span className="req">＊</span>
          </label>
          <div className="radio-group">
            {INSURANCE.map((i) => (
              <label key={i} className={p.insurance === i ? 'on' : ''}>
                <input
                  type="radio"
                  name="ins"
                  checked={p.insurance === i}
                  onChange={() => setP({ ...p, insurance: i })}
                />
                {i}
              </label>
            ))}
          </div>
        </div>

        <div className="field full">
          <label>
            状態<span className="req">＊</span>
          </label>
          <div className="radio-group">
            {STATUS.map((s) => (
              <label key={s} className={p.status === s ? 'on' : ''}>
                <input
                  type="radio"
                  name="st"
                  checked={p.status === s}
                  onChange={() => setP({ ...p, status: s })}
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>開始日</label>
          <input
            type="date"
            value={p.startDate ?? ''}
            onChange={(e) => setP({ ...p, startDate: e.target.value || undefined })}
          />
          {startsThisMonth && (
            <span className="hint" style={{ color: 'var(--c-info-text)' }}>
              当月開始 → 今月から人数判定に算入されます
            </span>
          )}
        </div>
        <div className="field">
          <label>終了日</label>
          <input
            type="date"
            value={p.endDate ?? ''}
            onChange={(e) => setP({ ...p, endDate: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label>入院日</label>
          <input
            type="date"
            value={p.admissionDate ?? ''}
            onChange={(e) => setP({ ...p, admissionDate: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label>退院日</label>
          <input
            type="date"
            value={p.dischargeDate ?? ''}
            onChange={(e) => setP({ ...p, dischargeDate: e.target.value || undefined })}
          />
        </div>
        {fac?.type === '個人宅' && (
          <div className="field full">
            <label>世帯ID（個人宅 同一世帯の特例用）</label>
            <input
              type="text"
              placeholder="同一世帯なら同じIDを入力（例: morita）"
              value={p.household ?? ''}
              onChange={(e) => setP({ ...p, household: e.target.value || undefined })}
            />
          </div>
        )}
        <div className="field full">
          <label>備考</label>
          <textarea
            value={p.note ?? ''}
            onChange={(e) => setP({ ...p, note: e.target.value || undefined })}
          />
        </div>
      </div>
    </Modal>
  );
}
