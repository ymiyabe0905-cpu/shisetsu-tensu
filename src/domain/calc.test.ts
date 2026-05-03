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

describe('区分判定', () => {
  const ym = '2026-05';

  it('戸数60、介護対象6人 → 全員518', () => {
    const fac = makeFac({ households: 60 });
    const ps = Array.from({ length: 6 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(518);
    expect(r[0].patientCount).toBe(6);
    expect(r[0].reason).toContain('10%特例');
  });

  it('戸数60、介護対象7人 → 379', () => {
    const fac = makeFac({ households: 60 });
    const ps = Array.from({ length: 7 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(379);
  });

  it('戸数51、介護対象5人 → 518', () => {
    const fac = makeFac({ households: 51 });
    const ps = Array.from({ length: 5 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(518);
  });

  it('戸数51、介護対象6人 → 379', () => {
    const fac = makeFac({ households: 51 });
    const ps = Array.from({ length: 6 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(379);
  });

  it('戸数19、介護対象2人 → 518', () => {
    const fac = makeFac({ households: 19 });
    const ps = Array.from({ length: 2 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(518);
    expect(r[0].reason).toContain('20戸未満');
  });

  it('戸数19、介護対象3人 → 379', () => {
    const fac = makeFac({ households: 19 });
    const ps = Array.from({ length: 3 }, (_, i) => makePatient(`p${i}`, fac.id));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], ps, vs), ym);
    expect(r[0].classification).toBe(379);
  });

  it('グループホーム2ユニット 8人/9人 → 各379', () => {
    const fac = makeFac({ type: 'グループホーム', units: [{ id: 'A', name: 'A棟', separateBuilding: true }, { id: 'B', name: 'B棟', separateBuilding: true }] });
    const a = Array.from({ length: 8 }, (_, i) => ({ ...makePatient(`a${i}`, fac.id), unitId: 'A' }));
    const b = Array.from({ length: 9 }, (_, i) => ({ ...makePatient(`b${i}`, fac.id), unitId: 'B' }));
    const all = [...a, ...b];
    const vs = all.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], all, vs), ym);
    expect(r).toHaveLength(2);
    expect(r.every((g) => g.classification === 379)).toBe(true);
  });

  it('介護1人 医療1人 → 別集計', () => {
    const fac = makeFac({ households: 30 });
    const k = makePatient('k', fac.id, '介護');
    const i = makePatient('i', fac.id, '医療');
    const vs = [makeVisit('k', ym, 5), makeVisit('i', ym, 5)];
    const r = calculateMonth(makeData([fac], [k, i], vs), ym);
    expect(r).toHaveLength(2);
    expect(r.find((g) => g.insurance === '介護')!.classification).toBe(518);
    expect(r.find((g) => g.insurance === '医療')!.classification).toBe(650);
  });

  it('医療5人 → 320', () => {
    const fac = makeFac({});
    const ps = Array.from({ length: 5 }, (_, i) => makePatient(`p${i}`, fac.id, '医療'));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    expect(calculateMonth(makeData([fac], ps, vs), ym)[0].classification).toBe(320);
  });

  it('医療10人 → 290', () => {
    const fac = makeFac({});
    const ps = Array.from({ length: 10 }, (_, i) => makePatient(`p${i}`, fac.id, '医療'));
    const vs = ps.map((p) => makeVisit(p.id, ym, 5));
    expect(calculateMonth(makeData([fac], ps, vs), ym)[0].classification).toBe(290);
  });

  it('介護＋介護予防 合算', () => {
    const fac = makeFac({});
    const p1 = makePatient('p1', fac.id, '介護');
    const p2 = makePatient('p2', fac.id, '介護予防');
    const vs = [makeVisit('p1', ym, 5), makeVisit('p2', ym, 5)];
    const r = calculateMonth(makeData([fac], [p1, p2], vs), ym);
    expect(r[0].patientCount).toBe(2);
    expect(r[0].classification).toBe(379);
  });

  it('訪問なし患者は含まれない', () => {
    const fac = makeFac({});
    const v = Array.from({ length: 9 }, (_, i) => makePatient(`v${i}`, fac.id));
    const nv = makePatient('nv', fac.id);
    const vs = v.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], [...v, nv], vs), ym);
    expect(r[0].patientCount).toBe(9);
    expect(r[0].classification).toBe(379);
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

describe('前月据置ルール', () => {
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

  it('A: 前月9(379) → 当月10(342)。継続=379、新規=342', () => {
    const prevP = Array.from({ length: 9 }, (_, i) => makePatient(`p${i}`, 'F1'));
    const newP = makePatient('p9', 'F1');
    const r = calculateMonth(setup(prevP, [...prevP, newP]), curr);
    expect(r[0].patientCount).toBe(10);
    expect(r[0].classification).toBe(342);
    expect(r[0].previousClassification).toBe(379);
    expect(r[0].continuingCount).toBe(9);
    expect(r[0].freshCount).toBe(1);
    expect(r[0].rows.filter((x) => x.carriedOver).every((x) => x.classification === 379)).toBe(true);
    expect(r[0].rows.filter((x) => !x.carriedOver)[0].classification).toBe(342);
  });

  it('B: 前月12(342) → 当月8(379)。継続=342、新規も=342', () => {
    const prevP = Array.from({ length: 12 }, (_, i) => makePatient(`p${i}`, 'F1'));
    const cont = prevP.slice(0, 7);
    const newP = makePatient('p100', 'F1');
    const r = calculateMonth(setup(prevP, [...cont, newP]), curr);
    expect(r[0].patientCount).toBe(8);
    expect(r[0].classification).toBe(379);
    expect(r[0].previousClassification).toBe(342);
    expect(r[0].rows.filter((x) => x.carriedOver).every((x) => x.classification === 342)).toBe(true);
    expect(r[0].rows.find((x) => !x.carriedOver)!.classification).toBe(342);
  });

  it('C: 前月9(379) → 当月9(379)。全員379', () => {
    const ps = Array.from({ length: 9 }, (_, i) => makePatient(`p${i}`, 'F1'));
    const r = calculateMonth(setup(ps, ps), curr);
    expect(r[0].classification).toBe(379);
    expect(r[0].previousClassification).toBe(379);
    expect(r[0].rows.every((x) => x.classification === 379)).toBe(true);
  });

  it('D: 前月1(518) → 当月2(379)。継続=518、新規=379', () => {
    const prevP = [makePatient('p0', 'F1')];
    const newP = makePatient('p1', 'F1');
    const r = calculateMonth(setup(prevP, [...prevP, newP]), curr);
    expect(r[0].previousClassification).toBe(518);
    expect(r[0].classification).toBe(379);
    expect(r[0].rows.find((x) => x.carriedOver)!.classification).toBe(518);
    expect(r[0].rows.find((x) => !x.carriedOver)!.classification).toBe(379);
  });

  it('E: 前月実績なし → 当月5(379)。全員新規', () => {
    const newPs = Array.from({ length: 5 }, (_, i) => makePatient(`p${i}`, 'F1'));
    const r = calculateMonth(setup([], newPs), curr);
    expect(r[0].previousClassification).toBe(null);
    expect(r[0].classification).toBe(379);
    expect(r[0].continuingCount).toBe(0);
    expect(r[0].freshCount).toBe(5);
    expect(r[0].rows.every((x) => x.classification === 379)).toBe(true);
  });

  it('2ヶ月空いた患者は新規扱い', () => {
    const fac = makeFac({ id: 'F1' });
    const p = makePatient('p', 'F1');
    const others = Array.from({ length: 5 }, (_, i) => makePatient(`o${i}`, 'F1'));
    const vs: VisitRecord[] = [
      makeVisit('p', '2026-03', 5),
      ...others.map((x) => makeVisit(x.id, '2026-04', 5)),
      ...[...others, p].map((x) => makeVisit(x.id, '2026-05', 5)),
    ];
    const r = calculateMonth(makeData([fac], [p, ...others], vs), '2026-05');
    expect(r[0].patientCount).toBe(6);
    expect(r[0].previousClassification).toBe(379);
    expect(r[0].rows.find((x) => x.patientId === 'p')!.carriedOver).toBe(false);
  });
});