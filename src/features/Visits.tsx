import { useMemo, useState } from 'react';
import { useStore, makeId } from '../state/store';
import { calculateMonth, visitOfMonth } from '../domain/calc';
import { Facility, Patient, VisitRecord } from '../domain/types';
import { dateToMd, thisMonth, todayIso, ymToLabel } from '../utils';
import { MonthPicker } from '../components/MonthPicker';
import { Modal } from '../components/Modal';

export function Visits() {
  const { data, dispatch } = useStore();
  const [ym, setYm] = useState(thisMonth());
  const [editVisit, setEditVisit] = useState<{ patient: Patient; visit: VisitRecord } | null>(null);

  // 当月の集計（区分判定）
  const calc = useMemo(() => calculateMonth(data, ym), [data, ym]);

  // 区分を取得（facilityId, unitId, insurance → classification）
  function getClassification(
    facId: string,
    unitId: string | undefined,
    insurance: '介護' | '医療'
  ): { count: number; cls: number | null } {
    const fac = data.facilities.find((f) => f.id === facId);
    const unit = fac?.units.find((u) => u.id === unitId);
    const sep = unit?.separateBuilding ?? false;
    const target = calc.find(
      (g) => g.facilityId === facId && g.insurance === insurance && (sep ? g.unitId === unitId : !g.unitId)
    );
    return { count: target?.rows.length ?? 0, cls: target?.classification ?? null };
  }

  function toggleVisit(patient: Patient) {
    const existing = visitOfMonth(patient.id, ym, data.visits);
    if (existing) {
      dispatch({ type: 'DELETE_VISIT', patientId: patient.id, yearMonth: ym });
    } else {
      if (patient.status !== '訪問対象' && patient.status !== '退院予定') {
        if (!confirm(`この患者は「${patient.status}」です。本当に訪問ありにしますか？`)) {
          return;
        }
      }
      const today = todayIso();
      const visitDate = today.startsWith(ym) ? today : `${ym}-01`;
      dispatch({
        type: 'UPSERT_VISIT',
        visit: { id: makeId('v'), patientId: patient.id, yearMonth: ym, visitDate },
      });
    }
  }

  function copyPrevMonth() {
    const prev = previousYm(ym);
    const prevVisits = data.visits.filter((v) => v.yearMonth === prev);
    if (prevVisits.length === 0) {
      alert('前月の訪問データがありません');
      return;
    }
    if (!confirm(`前月（${ymToLabel(prev)}）の対象者${prevVisits.length}件を当月にコピーしますか？\n（既に登録済みの患者はスキップ・入院や終了の患者は除外）`)) {
      return;
    }
    let copied = 0;
    for (const pv of prevVisits) {
      const exists = visitOfMonth(pv.patientId, ym, data.visits);
      if (exists) continue;
      const p = data.patients.find((x) => x.id === pv.patientId);
      if (!p || p.hidden) continue;
      if (p.status === '入院中' || p.status === '終了' || p.status === '死亡') continue;
      const today = todayIso();
      const visitDate = today.startsWith(ym) ? today : `${ym}-01`;
      dispatch({
        type: 'UPSERT_VISIT',
        visit: { id: makeId('v'), patientId: pv.patientId, yearMonth: ym, visitDate },
      });
      copied++;
    }
    alert(`${copied}件コピーしました`);
  }

  // 表示用カードを構築
  // 別建物ユニットがある施設は、ユニット単位でカードを分割
  // それ以外は施設単位
  const cards = buildCards(data.facilities, data.patients);

  return (
    <div>
      <div className="page-header">
        <h2>月別訪問登録</h2>
        <div className="hstack">
          <button className="btn" onClick={copyPrevMonth}>
            前月対象者をコピー
          </button>
          <MonthPicker value={ym} onChange={setYm} />
        </div>
      </div>

      <div className="alert info">
        タップ1回で訪問あり/なしを切替（タップ日が訪問日）。日付は患者ボタン右上「編集」から変更できます。
      </div>

      {cards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>
          施設または患者が登録されていません
        </div>
      )}

      {cards.map((card) => {
        const kaigo = getClassification(card.facility.id, card.unitId, '介護');
        const iryo = getClassification(card.facility.id, card.unitId, '医療');
        return (
          <div className="card" key={card.key}>
            <div className="card-head">
              <div>
                <div className="name">{card.label}</div>
                <div className="meta">
                  {card.facility.type}
                  {card.facility.households !== undefined && ` ・ 戸数 ${card.facility.households}`}
                  {card.unitId && ' ・ 別建物として算定'}
                </div>
              </div>
              <div className="summary">
                {kaigo.count > 0 && (
                  <span className="judge">
                    介護 {kaigo.count}人 → <b>{kaigo.cls ?? '—'}</b>
                  </span>
                )}
                {iryo.count > 0 && (
                  <span className="judge">
                    医療 {iryo.count}人 → <b>{iryo.cls ?? '—'}</b>
                  </span>
                )}
                {kaigo.count === 0 && iryo.count === 0 && (
                  <span style={{ color: 'var(--c-text-2)', fontSize: 12 }}>訪問実績なし</span>
                )}
                {card.facility.households === undefined && (
                  <span className="warn">戸数未入力</span>
                )}
              </div>
            </div>
            <div className="pt-grid">
              {card.patients.map((p) => {
                const v = visitOfMonth(p.id, ym, data.visits);
                const visited = !!v;
                const insBucket: '介護' | '医療' | null =
                  p.insurance === '介護' || p.insurance === '介護予防'
                    ? '介護'
                    : p.insurance === '医療'
                      ? '医療'
                      : null;
                const cls =
                  visited && insBucket
                    ? insBucket === '介護'
                      ? kaigo.cls
                      : iryo.cls
                    : null;
                const faded =
                  !visited &&
                  (p.status === '入院中' ||
                    p.status === '終了' ||
                    p.status === '死亡' ||
                    p.status === '一時停止');
                return (
                  <div
                    key={p.id}
                    className={`pt-btn ${visited ? 'visited' : ''} ${faded ? 'faded' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleVisit(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleVisit(p);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="top">
                      <span className="check">
                        {visited && v ? `✓ ${dateToMd(v.visitDate)} 訪問` : ''}
                      </span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="cls">{cls ?? '—'}</span>
                        {visited && v && (
                          <button
                            className="btn small"
                            style={{ padding: '2px 6px', fontSize: 10 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditVisit({ patient: p, visit: v });
                            }}
                          >
                            編集
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="nm">{p.name}</div>
                    <div className="kn">{p.kana ?? ''}</div>
                    <div className="tags">
                      <span className={`tag tag-${insTag(p.insurance)}`}>{p.insurance}</span>
                      {p.status !== '訪問対象' && (
                        <span className="tag tag-status">{p.status}</span>
                      )}
                      {p.startDate && p.startDate.startsWith(ym) && (
                        <span className="tag tag-new">新規 {dateToMd(p.startDate)}〜</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {card.patients.length === 0 && (
                <div style={{ color: 'var(--c-text-2)', fontSize: 12, padding: 8 }}>
                  患者が登録されていません
                </div>
              )}
            </div>
          </div>
        );
      })}

      {editVisit && (
        <VisitEditModal
          patient={editVisit.patient}
          visit={editVisit.visit}
          ym={ym}
          onClose={() => setEditVisit(null)}
        />
      )}
    </div>
  );
}

function insTag(i: string): string {
  switch (i) {
    case '介護':
      return 'kaigo';
    case '介護予防':
      return 'yobo';
    case '医療':
      return 'iryo';
    default:
      return 'none';
  }
}

interface CardData {
  key: string;
  facility: Facility;
  unitId: string | undefined;
  label: string;
  patients: Patient[];
}

function buildCards(facilities: Facility[], patients: Patient[]): CardData[] {
  const cards: CardData[] = [];
  for (const fac of facilities) {
    if (fac.hidden) continue;
    const sepUnits = fac.units.filter((u) => u.separateBuilding);
    if (sepUnits.length > 0) {
      // 別建物ユニットごとのカード
      for (const u of sepUnits) {
        const ps = patients.filter(
          (p) => !p.hidden && p.facilityId === fac.id && p.unitId === u.id
        );
        cards.push({
          key: `${fac.id}/${u.id}`,
          facility: fac,
          unitId: u.id,
          label: `${fac.name} ${u.name}`,
          patients: ps,
        });
      }
      // 残りの患者（unitなし、または合算ユニット所属）
      const rest = patients.filter((p) => {
        if (p.hidden) return false;
        if (p.facilityId !== fac.id) return false;
        const u = fac.units.find((x) => x.id === p.unitId);
        return !u || !u.separateBuilding;
      });
      if (rest.length > 0) {
        cards.push({
          key: `${fac.id}/_rest`,
          facility: fac,
          unitId: undefined,
          label: `${fac.name}（合算）`,
          patients: rest,
        });
      }
    } else {
      // 棟なし or 全部合算
      const ps = patients.filter((p) => !p.hidden && p.facilityId === fac.id);
      cards.push({
        key: fac.id,
        facility: fac,
        unitId: undefined,
        label: fac.name,
        patients: ps,
      });
    }
  }
  return cards;
}

function previousYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface VisitEditProps {
  patient: Patient;
  visit: VisitRecord;
  ym: string;
  onClose: () => void;
}

function VisitEditModal({ patient, visit, ym, onClose }: VisitEditProps) {
  const { dispatch } = useStore();
  const [date, setDate] = useState(visit.visitDate);

  function save() {
    if (!date.startsWith(ym)) {
      alert('算定対象月の日付を選んでください');
      return;
    }
    dispatch({ type: 'UPSERT_VISIT', visit: { ...visit, visitDate: date } });
    onClose();
  }

  function remove() {
    if (!confirm('訪問記録を取り消しますか？')) return;
    dispatch({ type: 'DELETE_VISIT', patientId: patient.id, yearMonth: ym });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${patient.name} ・ 訪問日`}
      footer={
        <>
          <button className="btn danger" onClick={remove}>
            訪問取消
          </button>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <label>訪問日</label>
        <input
          type="date"
          value={date}
          min={`${ym}-01`}
          max={`${ym}-31`}
          onChange={(e) => setDate(e.target.value)}
        />
        <span className="hint">算定対象月（{ymToLabel(ym)}）の日付のみ選択可</span>
      </div>
    </Modal>
  );
}
