import { useState } from 'react';
import { Facility, FacilityType, Unit } from '../domain/types';
import { useStore, makeId } from '../state/store';
import { Modal } from '../components/Modal';

const FACILITY_TYPES: FacilityType[] = [
  '一般施設',
  '有料老人ホーム',
  'サ高住',
  'グループホーム',
  '個人宅',
  'その他',
];

export function Facilities() {
  const { data, dispatch } = useStore();
  const [editing, setEditing] = useState<Facility | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  const filtered = data.facilities
    .filter((f) => !f.hidden)
    .filter((f) => !filterType || f.type === filterType)
    .filter((f) => !searchText || f.name.includes(searchText));

  function newFacility(): Facility {
    return {
      id: makeId('fac'),
      name: '',
      type: '一般施設',
      units: [],
    };
  }

  function deleteFacility(f: Facility) {
    const has = data.patients.some((p) => p.facilityId === f.id && !p.hidden);
    if (has) {
      alert('この施設には所属患者がいます。先に患者を移動または削除してください。');
      return;
    }
    if (confirm(`施設「${f.name}」を削除しますか？`)) {
      dispatch({ type: 'DELETE_FACILITY', id: f.id });
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>施設一覧</h2>
        <button className="btn primary" onClick={() => setEditing(newFacility())}>
          ＋ 施設を追加
        </button>
      </div>

      <div className="hstack" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="施設名で検索"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: 'auto' }}>
          <option value="">全種別</option>
          {FACILITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>施設名</th>
              <th>種別</th>
              <th className="num">戸数</th>
              <th className="num">10%上限</th>
              <th>特例・棟</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>
                  施設が登録されていません
                </td>
              </tr>
            )}
            {filtered.map((f) => (
              <tr key={f.id}>
                <td>
                  <div className="nm">{f.name}</div>
                  <div className="kn">{f.building ?? '—'}</div>
                </td>
                <td>
                  <span className="tag tag-info">{f.type}</span>
                </td>
                <td className="num">
                  {f.households !== undefined ? (
                    f.households
                  ) : (
                    <span style={{ color: 'var(--c-warning-text)' }}>未入力</span>
                  )}
                </td>
                <td className="num">
                  {f.households !== undefined ? `${Math.floor(f.households * 0.1)}人` : '—'}
                </td>
                <td>
                  {f.households !== undefined && f.households < 20 && (
                    <span className="tag tag-pink" style={{ marginRight: 4 }}>
                      20戸未満
                    </span>
                  )}
                  {f.units.length > 0 && (
                    <span className="tag tag-info">
                      棟{f.units.length}（
                      {f.units.filter((u) => u.separateBuilding).length > 0 ? '別建物あり' : '合算'}
                      ）
                    </span>
                  )}
                </td>
                <td className="hstack" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn small" onClick={() => setEditing(f)}>
                    編集
                  </button>
                  <button className="btn small danger" onClick={() => deleteFacility(f)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <FacilityForm facility={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface FormProps {
  facility: Facility;
  onClose: () => void;
}

function FacilityForm({ facility, onClose }: FormProps) {
  const { dispatch } = useStore();
  const [f, setF] = useState<Facility>(facility);

  const groupHomeForceSeparate = f.type === 'グループホーム' && f.units.length > 0 && f.units.length <= 3;
  const tenPercent = f.households !== undefined ? Math.floor(f.households * 0.1) : null;
  const under20 = f.households !== undefined && f.households < 20;

  function save() {
    if (!f.name.trim()) {
      alert('施設名を入力してください');
      return;
    }
    let toSave = { ...f, name: f.name.trim() };
    // グループホームかつユニット数≤3 → 自動で別建物
    if (groupHomeForceSeparate) {
      toSave = {
        ...toSave,
        units: toSave.units.map((u) => ({ ...u, separateBuilding: true })),
      };
    }
    dispatch({ type: 'UPSERT_FACILITY', facility: toSave });
    onClose();
  }

  function addUnit() {
    setF({
      ...f,
      units: [
        ...f.units,
        { id: makeId('unit'), name: '', separateBuilding: groupHomeForceSeparate },
      ],
    });
  }

  function updateUnit(idx: number, u: Unit) {
    const units = [...f.units];
    units[idx] = u;
    setF({ ...f, units });
  }

  function removeUnit(idx: number) {
    setF({ ...f, units: f.units.filter((_, i) => i !== idx) });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={facility.name ? `施設の編集: ${facility.name}` : '施設の追加'}
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
        <div className="field full">
          <label>
            施設名<span className="req">＊</span>
          </label>
          <input
            type="text"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>建物名</label>
          <input
            type="text"
            value={f.building ?? ''}
            onChange={(e) => setF({ ...f, building: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label>
            施設種別<span className="req">＊</span>
          </label>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FacilityType })}>
            {FACILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>戸数（または居室数）</label>
          <input
            type="number"
            min={0}
            value={f.households ?? ''}
            onChange={(e) =>
              setF({ ...f, households: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          {f.households === undefined && (
            <span className="hint">未入力だと10%特例の自動判定ができません</span>
          )}
        </div>
        <div className="field">
          <label>10%特例 上限人数（自動）</label>
          <div className="computed">
            {tenPercent !== null ? (
              <>
                floor({f.households} × 0.1) = <b>{tenPercent}人</b>
              </>
            ) : (
              <span style={{ color: 'var(--c-text-3)' }}>戸数未入力</span>
            )}
          </div>
        </div>
        <div className="field">
          <label>20戸未満2人以下特例（自動）</label>
          <div className="computed">
            {f.households !== undefined ? (
              under20 ? (
                <>
                  戸数{f.households} → <b>条件該当</b>（対象が2人以下なら適用）
                </>
              ) : (
                '対象外'
              )
            ) : (
              <span style={{ color: 'var(--c-text-3)' }}>戸数未入力</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="row">
          <strong style={{ fontSize: 13 }}>棟・ユニット</strong>
          <button className="btn small" onClick={addUnit}>
            ＋ 追加
          </button>
        </div>
        {groupHomeForceSeparate && (
          <div className="alert info" style={{ marginTop: 6, marginBottom: 6, fontSize: 12 }}>
            グループホームでユニット数3以下のため、「別建物として算定」が自動でONになります。
          </div>
        )}
        {!groupHomeForceSeparate && f.units.length > 0 && (
          <div className="alert info" style={{ marginTop: 6, marginBottom: 6, fontSize: 12 }}>
            「別建物として算定」をONにすると、その棟・ユニットは独立した建物として人数判定されます（物理的に別棟の場合のみ推奨）。
          </div>
        )}
        {f.units.length === 0 && (
          <div className="muted" style={{ padding: '8px 0' }}>
            棟・ユニットなし
          </div>
        )}
        {f.units.length > 0 && (
          <div className="unit-list">
            {f.units.map((u, i) => (
              <div className="unit-row" key={u.id}>
                <input
                  type="text"
                  placeholder="例: 西棟、A棟"
                  value={u.name}
                  onChange={(e) => updateUnit(i, { ...u, name: e.target.value })}
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={u.separateBuilding}
                    disabled={groupHomeForceSeparate}
                    onChange={(e) => updateUnit(i, { ...u, separateBuilding: e.target.checked })}
                  />
                  別建物として算定
                </label>
                <button className="btn small danger" onClick={() => removeUnit(i)}>
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
