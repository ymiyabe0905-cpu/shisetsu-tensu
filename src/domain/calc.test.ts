import { describe, expect, it } from 'vitest';
import { calculateMonth } from './calc';
import { AppData, DEFAULT_SETTINGS, Facility, Patient, VisitRecord } from './types';
 
function makeData(facilities: Facility[], patients: Patient[], visits: VisitRecord[]): AppData {
  return { schemaVersion: 1, facilities, patients, visits, events: [], settings: DEFAULT_SETTINGS };
}
function makeFac(opts: Partial<Facility>): Facility {
  return { id: opts.id ?? 'F1', name: opts.name ?? '施設', type: opts.type ?? '有料老人ホーム', households: opts.households, units: opts.units ?? [], ...opts };
}
function makePatient(id: string, facilityId: string, insurance: Patient['insurance'] = '介護'): Patient {
  return { id, name: id, facilityId, insurance, status: '訪問対象' };
}
function makeVisit(patientId: string, ym: string, day: number): VisitRecord {
  return { id: `v_${patientId}_${ym}`, patientId, yearMonth: ym, visitDate: `${ym}-${String(day).padStart(2, '0')}` };
}
 
describe('区分判定（一律ケース）', () => {
  const ym = '2026-05';
 
  it('戸数60、6人 → 全員518（10%特例）', () => {
    const fac = makeFac({ households: 60 });
    const ps = Array.from({ length: 6 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].rows.every((row) => row.classification === 518)).toBe(true);
  });
 
  it('戸数19、2人 → 全員518（20戸未満特例）', () => {
    const fac = makeFac({ households: 19 });
    const ps = Array.from({ length: 2 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].rows.every((row) => row.classification === 518)).toBe(true);
  });
 
  it('グループホーム2ユニット 8人/9人（前月実績なし） → 各棟 1人目=518, 残り=379', () => {
    const fac = makeFac({ type: 'グループホーム', units: [{ id: 'A', name: 'A棟', separateBuilding: true }, { id: 'B', name: 'B棟', separateBuilding: true }] });
    const a = Array.from({ length: 8 }, (_, i) => ({ ...makePatient(`a${i}`, fac.id), unitId: 'A' }));
    const b = Array.from({ length: 9 }, (_, i) => ({ ...makePatient(`b${i}`, fac.id), unitId: 'B' }));
    const all = [...a, ...b];
    const vs = all.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], all, vs), ym);
    expect(r).toHaveLength(2);
    for (const g of r) {
      // 1人目（patientId昇順で先頭）=518, 残り=379
      const sorted = [...g.rows].sort((x, y) => x.patientId.localeCompare(y.patientId));
      expect(sorted[0].classification).toBe(518);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].classification).toBe(379);
      }
    }
  });
});
 
describe('棟移動', () => {
  const ym = '2026-05';
  it('別建物の棟間移動 → 訪問日の在籍棟で集計', () => {
    const fac: Facility = {
      id: 'F1', name: 'けやきの郷', type: 'サ高住', households: 30,
      units: [{ id: 'W', name: '西棟', separateBuilding: true }, { id: 'E', name: '東棟', separateBuilding: true }],
    };
    const w = Array.from({ length: 3 }, (_, i) => ({ ...makePatient(`w${i}`, fac.id), unitId: 'W' }));
    const e = Array.from({ length: 3 }, (_, i) => ({ ...makePatient(`e${i}`, fac.id), unitId: 'E' }));
    const m: Patient = { ...makePatient('m1', fac.id), unitId: 'W' };
    const all = [...w, ...e, m];
    const vs = [...w.map((p) => makeVisit(p.id, ym, 5)), ...e.map((p) => makeVisit(p.id, ym, 20)), makeVisit('m1', ym, 20)];
    const data: AppData = {
      schemaVersion: 1, facilities: [fac], patients: all, visits: vs,
      events: [{ id: 'mv1', patientId: 'm1', kind: '棟ユニット移動', date: `${ym}-15`, fromFacilityId: fac.id, fromUnitId: 'W', toFacilityId: fac.id, toUnitId: 'E' }],
      settings: DEFAULT_SETTINGS,
    };
    const r = calculateMonth(data, ym);
    expect(r.find((g) => g.groupLabel.includes('西棟'))!.patientCount).toBe(3);
    expect(r.find((g) => g.groupLabel.includes('東棟'))!.patientCount).toBe(4);
  });
});
 
describe('通し番号方式', () => {
  const prev = '2026-04';
  const curr = '2026-05';
  function setup(prevPs: Patient[], currPs: Patient[]): AppData {
    const fac = makeFac({ id: 'F1', households: undefined });
    const all: Patient[] = [];
    const seen = new Set<string>();
    for (const p of [...prevPs, ...currPs]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      all.push(p);
    }
    const vs: VisitRecord[] = [
      ...prevPs.map((p) => makeVisit(p.id, prev, 5)),
      ...currPs.map((p) => makeVisit(p.id, curr, 10)),
    ];
    return makeData([fac], all, vs);
  }
 
  it('ケース1: 前月9(379) → 当月 継続9+新規1。継続=379, 新規=342', () => {
    const prevP = Array.from({ length: 9 }, (_, i) => makePatient(`p${i.toString().padStart(2, '0')}`, 'F1'));
    const newP = makePatient('z_new', 'F1');
    const r = calculateMonth(setup(prevP, [...prevP, newP]), curr);
    expect(r[0].continuingCount).toBe(9);
    expect(r[0].freshCount).toBe(1);
    expect(r[0].rows.filter((x) => x.carriedOver).every((x) => x.classification === 379)).toBe(true);
    expect(r[0].rows.find((x) => x.patientId === 'z_new')!.classification).toBe(342);
  });
 
  it('ケース2: 前月7(379) → 継続7+新規3。新規1人目=379, 新規2人目=379, 新規3人目=342', () => {
    const prevP = Array.from({ length: 7 }, (_, i) => makePatient(`p${i.toString().padStart(2, '0')}`, 'F1'));
    const newPs = [
      { ...makePatient('n1', 'F1') },
      { ...makePatient('n2', 'F1') },
      { ...makePatient('n3', 'F1') },
    ];
    const r = calculateMonth(setup(prevP, [...prevP, ...newPs]), curr);
    expect(r[0].continuingCount).toBe(7);
    expect(r[0].freshCount).toBe(3);
    expect(r[0].rows.find((x) => x.patientId === 'n1')!.classification).toBe(379);
    expect(r[0].rows.find((x) => x.patientId === 'n2')!.classification).toBe(379);
    expect(r[0].rows.find((x) => x.patientId === 'n3')!.classification).toBe(342);
  });
 
  it('ケース3: 前月9(379) → 継続0+新規1。新規=342（前月人数を引き継ぐ）', () => {
    const prevP = Array.from({ length: 9 }, (_, i) => makePatient(`p${i.toString().padStart(2, '0')}`, 'F1'));
    const newP = makePatient('z_new', 'F1');
    const r = calculateMonth(setup(prevP, [newP]), curr);
    expect(r[0].patientCount).toBe(1);
    expect(r[0].rows[0].classification).toBe(342);
  });
 
  it('ケース4: 前月0 → 当月新規3人。1人目=518, 2人目=379, 3人目=379', () => {
    const newPs = [
      makePatient('n1', 'F1'),
      makePatient('n2', 'F1'),
      makePatient('n3', 'F1'),
    ];
    const r = calculateMonth(setup([], newPs), curr);
    expect(r[0].rows.find((x) => x.patientId === 'n1')!.classification).toBe(518);
    expect(r[0].rows.find((x) => x.patientId === 'n2')!.classification).toBe(379);
    expect(r[0].rows.find((x) => x.patientId === 'n3')!.classification).toBe(379);
  });
 
  it('ケース5: 前月12(342) → 継続12+新規1。継続=342, 新規=342', () => {
    const prevP = Array.from({ length: 12 }, (_, i) => makePatient(`p${i.toString().padStart(2, '0')}`, 'F1'));
    const newP = makePatient('z_new', 'F1');
    const r = calculateMonth(setup(prevP, [...prevP, newP]), curr);
    expect(r[0].rows.filter((x) => x.carriedOver).every((x) => x.classification === 342)).toBe(true);
    expect(r[0].rows.find((x) => x.patientId === 'z_new')!.classification).toBe(342);
  });
 
  it('同日訪問は患者ID順で通し番号', () => {
    const fac = makeFac({ id: 'F1' });
    const ps = [makePatient('za', 'F1'), makePatient('zb', 'F1'), makePatient('zc', 'F1')];
    const vs = ps.map((p) => makeVisit(p.id, curr, 5));
    const r = calculateMonth(makeData([fac], ps, vs), curr);
    // za=1人目=518, zb=2人目=379, zc=3人目=379
    expect(r[0].rows.find((x) => x.patientId === 'za')!.classification).toBe(518);
    expect(r[0].rows.find((x) => x.patientId === 'zb')!.classification).toBe(379);
    expect(r[0].rows.find((x) => x.patientId === 'zc')!.classification).toBe(379);
  });
});
 