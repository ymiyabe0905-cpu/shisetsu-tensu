import { useEffect, useMemo, useState } from 'react';
import { useStore, makeId } from '../state/store';
import { calculateMonth, visitOfMonth, visitedPreviousMonth, moveEventInMonth, locationOnDate } from '../domain/calc';
import { Facility, Patient, PatientEvent, VisitRecord } from '../domain/types';
import { dateToMd, thisMonth, todayIso, ymToLabel } from '../utils';
import { MonthPicker } from '../components/MonthPicker';
import { Modal } from '../components/Modal';

export function Visits() {
  const { data, dispatch } = useStore();
  const [ym, setYm] = useState(thisMonth());
  const [editVisit, setEditVisit] = useState<{ patient: Patient; visit: VisitRecord } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterFac, setFilterFac] = useState('');

  const calc = useMemo(() => calculateMonth(data, ym, { includePrevOnlyGroups: true }), [data, ym]);

  // トーストを数秒で自動的に消す
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function classFor(facId: string, unitId: string | undefined, insurance: '介護' | '医療', patientId: string): number | null {
    const fac = data.facilities.find((f) => f.id === facId);
    const unit = fac?.units.find((u) => u.id === unitId);
    const sep = unit?.separateBuilding ?? false;
    const target = calc.find(
      (g) => g.facilityId === facId && g.insurance === insurance && (sep ? g.unitId === unitId : !g.unitId)
    );
    if (!target) return null;
    const row = target.rows.find((r) => r.patientId === patientId);
    return row?.classification ?? null;
  }

  function summaryFor(facId: string, unitId: string | undefined, insurance: '介護' | '医療') {
    const fac = data.facilities.find((f) => f.id === facId);
    const unit = fac?.units.find((u) => u.id === unitId);
    const sep = unit?.separateBuilding ?? false;
    return calc.find(
      (g) => g.facilityId === facId && g.insurance === insurance && (sep ? g.unitId === unitId : !g.unitId)
    );
  }

  function toggleVisit(patient: Patient) {
    const existing = visitOfMonth(patient.id, ym, data.visits);
    const today = todayIso();
    const visitDate = today.startsWith(ym) ? today : `${ym}-01`;
    // 棟移動: 同月内に移動があり、既存訪問が移動日より前なら、削除ではなく置換
    const move = moveEventInMonth(patient.id, ym, data.events);
    if (existing && move && existing.visitDate < move.date) {
      dispatch({ type: 'UPSERT_VISIT', visit: { ...existing, visitDate } });
      return;
    }

    // タップ前の各患者の点数を記録（区分が切り替わったか比較するため）
    const before = classMap(data);

    let nextData: typeof data;
    if (existing) {
      dispatch({ type: 'DELETE_VISIT', patientId: patient.id, yearMonth: ym });
      nextData = { ...data, visits: data.visits.filter((v) => !(v.patientId === patient.id && v.yearMonth === ym)) };
    } else {
      if (patient.status !== '訪問対象' && patient.status !== '退院予定') {
        if (!confirm(`この患者は「${patient.status}」です。本当に訪問ありにしますか？`)) return;
      }
      const newVisit = { id: makeId('v'), patientId: patient.id, yearMonth: ym, visitDate };
      dispatch({ type: 'UPSERT_VISIT', visit: newVisit });
      nextData = { ...data, visits: [...data.visits, newVisit] };
    }

    // 区分（点数ティア）が切り替わった人がいるときだけトースト表示
    const msg = changeMessage(before, nextData, patient);
    if (msg) setToast(msg);
  }

  // 患者ID → 点数 のマップ（その時点の計算結果）
  function classMap(d: typeof data): Map<string, number> {
    const m = new Map<string, number>();
    for (const g of calculateMonth(d, ym)) {
      for (const r of g.rows) {
        if (r.classification !== null) m.set(r.patientId, r.classification);
      }
    }
    return m;
  }

  // 各患者の理由ラベルを引く
  function reasonLabelFor(d: typeof data, patientId: string): string {
    for (const g of calculateMonth(d, ym)) {
      const r = g.rows.find((x) => x.patientId === patientId);
      if (r) return r.reasonLabel;
    }
    return '';
  }

  // タップ前後で点数が変わった人をまとめた1行メッセージ（変化なしは null）
  function changeMessage(
    before: Map<string, number>,
    nextData: typeof data,
    tapped: Patient
  ): string | null {
    const after = classMap(nextData);
    // 点数が変わった患者ID（タップ本人と、連動して変わった他の人）
    const changedIds: string[] = [];
    const ids = new Set<string>([...before.keys(), ...after.keys()]);
    for (const id of ids) {
      if (before.get(id) !== after.get(id)) changedIds.push(id);
    }
    if (changedIds.length === 0) return null;

    // タップ本人を優先して主メッセージにする
    const mainId = changedIds.includes(tapped.id) ? tapped.id : changedIds[0];
    const mainP = data.patients.find((p) => p.id === mainId);
    const newCls = after.get(mainId);
    if (newCls === undefined) {
      // 取消で算定対象から外れた等
      return `${mainP?.name ?? ''}：訪問取消`;
    }
    const label = reasonLabelFor(nextData, mainId);
    let msg = `${mainP?.name ?? ''}：${newCls}（${label}）`;
    const others = changedIds.filter((id) => id !== mainId).length;
    if (others > 0) msg += ` ／ 連動して他${others}人も変更`;
    return msg;
  }

  const cards = buildCards(data.facilities, data.patients, data.events, ym, { search, filterFac });

  return (
    <div>
      {toast && (
        <div className="toast no-print" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      <div className="page-header">
        <h2>月別訪問登録</h2>
        <div className="hstack">
          <MonthPicker value={ym} onChange={setYm} />
        </div>
      </div>

      <div className="hstack" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="患者名・フリガナで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={filterFac} onChange={(e) => setFilterFac(e.target.value)} style={{ width: 'auto' }}>
          <option value="">全施設</option>
          {[...data.facilities]
            .filter((f) => !f.hidden)
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </div>

      <div className="alert info">
        タップ1回で訪問あり/なしを切替（タップ日が訪問日）。前月にも訪問した患者は「前月✓」マーク付き、点数は前月据置。新規者のみ点数下がる方向の場合は当月区分が適用されます。
      </div>

      {cards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>
          {search || filterFac ? '条件に一致する患者がいません' : '施設または患者が登録されていません'}
        </div>
      )}

      {cards.map((card) => {
        const ks = summaryFor(card.facility.id, card.unitId, '介護');
        const is = summaryFor(card.facility.id, card.unitId, '医療');
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
                {ks && ks.rows.length > 0 && (
                  <>
                    <span>介護 <b>{ks.rows.length}人</b>（継続{ks.continuingCount}/新規{ks.freshCount}）</span>
                    <span className="judge">基準区分: <b>{ks.classification}</b></span>
                  </>
                )}
                {ks && ks.rows.length === 0 && ks.previousClassification !== null && (
                  <>
                    <span style={{ color: 'var(--c-text-2)' }}>介護 当月0人（前月実績あり）</span>
                    <span className="judge">基準区分: <b>{ks.classification}</b></span>
                  </>
                )}
                {is && is.rows.length > 0 && (
                  <>
                    <span>医療 <b>{is.rows.length}人</b></span>
                    <span className="judge">基準区分: <b>{is.classification}</b></span>
                  </>
                )}
                {is && is.rows.length === 0 && is.previousClassification !== null && (
                  <>
                    <span style={{ color: 'var(--c-text-2)' }}>医療 当月0人（前月実績あり）</span>
                    <span className="judge">基準区分: <b>{is.classification}</b></span>
                  </>
                )}
                {(!ks || (ks.rows.length === 0 && ks.previousClassification === null)) &&
                  (!is || (is.rows.length === 0 && is.previousClassification === null)) && (
                    <span style={{ color: 'var(--c-text-2)', fontSize: 12 }}>訪問実績なし</span>
                  )}
                {card.facility.households === undefined && <span className="warn">戸数未入力</span>}
              </div>
            </div>
            <div className="pt-grid">
              {card.patients.map((p) => {
                const v = visitOfMonth(p.id, ym, data.visits);
                // 訪問✓は訪問日時点の所在カードだけに表示。移動先カードは訪問なし（白）で表示する。
                const visited = !!v && locMatchesCard(locationOnDate(p, v.visitDate, data.events), card.facility, card.unitId);
                // 前月訪問の有無（タップ前でも分かるように、当月訪問とは切り離して判定）
                const wasPrev = visitedPreviousMonth(p.id, ym, data.visits);
                const insBucket: '介護' | '医療' | null =
                  p.insurance === '介護' || p.insurance === '介護予防' ? '介護'
                  : p.insurance === '医療' ? '医療' : null;
                const cls = visited && insBucket ? classFor(card.facility.id, card.unitId, insBucket, p.id) : null;
                const faded = !visited && (p.status === '入院中' || p.status === '終了' || p.status === '死亡' || p.status === '一時停止');
                const carryClass = visited && wasPrev ? 'continued' : visited ? 'fresh' : '';
                return (
                  <div
                    key={p.id}
                    className={`pt-btn ${visited ? 'visited' : ''} ${faded ? 'faded' : ''} ${carryClass}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleVisit(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleVisit(p); } }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="top">
                      <span className="check">{visited && v ? `✓ ${dateToMd(v.visitDate)} 訪問` : ''}</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="cls">{cls ?? '—'}</span>
                        {visited && v && (
                          <button
                            className="btn small"
                            style={{ padding: '2px 6px', fontSize: 10 }}
                            onClick={(e) => { e.stopPropagation(); setEditVisit({ patient: p, visit: v }); }}
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
                      {wasPrev && <span className="tag tag-prev">前月✓</span>}
                      {!wasPrev && visited && <span className="tag tag-new">新規</span>}
                      {p.status !== '訪問対象' && <span className="tag tag-status">{p.status}</span>}
                      {p.startDate && p.startDate.startsWith(ym) && (
                        <span className="tag tag-new">開始 {dateToMd(p.startDate)}〜</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {card.patients.length === 0 && (
                <div style={{ color: 'var(--c-text-2)', fontSize: 12, padding: 8 }}>患者が登録されていません</div>
              )}
            </div>
          </div>
        );
      })}

      {editVisit && <VisitEditModal patient={editVisit.patient} visit={editVisit.visit} ym={ym} onClose={() => setEditVisit(null)} />}
    </div>
  );
}

function insTag(i: string): string {
  switch (i) {
    case '介護': return 'kaigo';
    case '介護予防': return 'yobo';
    case '医療': return 'iryo';
    default: return 'none';
  }
}

interface CardData {
  key: string;
  facility: Facility;
  unitId: string | undefined;
  label: string;
  patients: Patient[];
}

interface CardFilter {
  search: string;
  filterFac: string;
}

// 50音順の比較（フリガナ優先・なければ氏名で代用）
function byKana(a: Patient, b: Patient): number {
  const ka = (a.kana ?? a.name) || '';
  const kb = (b.kana ?? b.name) || '';
  return ka.localeCompare(kb, 'ja');
}

// その所在(loc)が、カード(fac, cardUnitId)に属するか判定。
// cardUnitId=undefined は合算/通常カード（別建物でないユニット所在を受け持つ）。
function locMatchesCard(
  loc: { facilityId: string; unitId?: string },
  fac: Facility,
  cardUnitId: string | undefined
): boolean {
  if (loc.facilityId !== fac.id) return false;
  if (cardUnitId !== undefined) return loc.unitId === cardUnitId;
  const u = fac.units.find((x) => x.id === loc.unitId);
  return !u || !u.separateBuilding;
}

// 当月にその患者が所属していた所在の一覧（現在地＋当月の移動の移動元/移動先）。
// 棟/施設移動した患者を、その月は移動前の施設・ユニットにも表示するために使う。
function patientLocationsInMonth(
  p: Patient,
  ym: string,
  events: PatientEvent[]
): { facilityId: string; unitId?: string }[] {
  const locs: { facilityId: string; unitId?: string }[] = [
    { facilityId: p.facilityId, unitId: p.unitId },
  ];
  for (const e of events) {
    if (e.patientId !== p.id) continue;
    if (e.kind !== '棟ユニット移動' && e.kind !== '施設移動') continue;
    if (!e.date.startsWith(ym)) continue;
    if (e.fromFacilityId) locs.push({ facilityId: e.fromFacilityId, unitId: e.fromUnitId });
    if (e.toFacilityId) locs.push({ facilityId: e.toFacilityId, unitId: e.toUnitId });
  }
  // 重複を除去
  const seen = new Set<string>();
  return locs.filter((l) => {
    const k = `${l.facilityId}/${l.unitId ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildCards(
  facilities: Facility[],
  patients: Patient[],
  events: PatientEvent[],
  ym: string,
  filter: CardFilter
): CardData[] {
  const q = filter.search.trim();
  // 患者名・フリガナで部分一致（空なら全員通す）
  const matchPatient = (p: Patient) =>
    !q || p.name.includes(q) || (p.kana ?? '').includes(q);

  // その患者が「(fac, unitId)カード」に属するか。
  // 当月の所在（現在地＋移動元/移動先）のいずれかが一致すれば属する。
  // unitId=undefined のカード（合算/通常施設）は、別建物でないユニット所在を受け持つ。
  const belongs = (p: Patient, fac: Facility, unitId: string | undefined) =>
    patientLocationsInMonth(p, ym, events).some((loc) => locMatchesCard(loc, fac, unitId));

  const cards: CardData[] = [];
  // 施設名順（あいうえお）に並べる
  const sortedFacs = [...facilities].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  for (const fac of sortedFacs) {
    if (fac.hidden) continue;
    if (filter.filterFac && fac.id !== filter.filterFac) continue;
    const sepUnits = fac.units.filter((u) => u.separateBuilding);
    if (sepUnits.length > 0) {
      for (const u of sepUnits) {
        const ps = patients.filter((p) => !p.hidden && matchPatient(p) && belongs(p, fac, u.id)).sort(byKana);
        if (q && ps.length === 0) continue; // 検索中で該当者ゼロのカードは隠す
        cards.push({ key: `${fac.id}/${u.id}`, facility: fac, unitId: u.id, label: `${fac.name} ${u.name}`, patients: ps });
      }
      const rest = patients.filter((p) => !p.hidden && matchPatient(p) && belongs(p, fac, undefined)).sort(byKana);
      if (rest.length > 0) {
        cards.push({ key: `${fac.id}/_rest`, facility: fac, unitId: undefined, label: `${fac.name}（合算）`, patients: rest });
      }
    } else {
      const ps = patients.filter((p) => !p.hidden && matchPatient(p) && belongs(p, fac, undefined)).sort(byKana);
      if (q && ps.length === 0) continue; // 検索中で該当者ゼロのカードは隠す
      cards.push({ key: fac.id, facility: fac, unitId: undefined, label: fac.name, patients: ps });
    }
  }
  return cards;
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
    if (!date.startsWith(ym)) { alert('算定対象月の日付を選んでください'); return; }
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
      open onClose={onClose} title={`${patient.name} ・ 訪問日`}
      footer={
        <>
          <button className="btn danger" onClick={remove}>訪問取消</button>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn primary" onClick={save}>保存</button>
        </>
      }
    >
      <div className="field">
        <label>訪問日</label>
        <input type="date" value={date} min={`${ym}-01`} max={`${ym}-31`} onChange={(e) => setDate(e.target.value)} />
        <span className="hint">算定対象月（{ymToLabel(ym)}）の日付のみ選択可</span>
      </div>
    </Modal>
  );
}