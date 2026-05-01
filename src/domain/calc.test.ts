import { describe, expect, it } from 'vitest';
import { calculateMonth } from './calc';
import { AppData, DEFAULT_SETTINGS, Facility, Patient, VisitRecord } from './types';

function makeData(facilities: Facility[], patients: Patient[], visits: VisitRecord[]): AppData {
  return {
    schemaVersion: 1,
    facilities,
    patients,
    visits,
    events: [],
    settings: DEFAULT_SETTINGS,
  };
}

function makeFac(opts: Partial<Facility>): Facility {
  return {
    id: opts.id ?? 'F1',
    name: opts.name ?? '施設',
    type: opts.type ?? '有料老人ホーム',
    households: opts.households,
    units: opts.units ?? [],
    ...opts,
  };
}

function makePatient(id: string, facilityId: string, insurance: Patient['insurance'] = '介護'): Patient {
  return {
    id,
    name: id,
    facilityId,
    insurance,
    status: '訪問対象',
  };
}

function makeVisit(patientId: string, ym: string, day: number): VisitRecord {
  return {
    id: `v_${patientId}`,
    patientId,
    yearMonth: ym,
    visitDate: `${ym}-${String(day).padStart(2, '0')}`,
  };
}

describe('区分判定', () => {
  const ym = '2026-05';

  it('戸数60、介護対象6人 → 10%以下なので全員518', () => {
    const fac = makeFac({ households: 60 });
    const patients = Array.from({ length: 6 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r).toHaveLength(1);
    expect(r[0].classification).toBe(518);
    expect(r[0].patientCount).toBe(6);
    expect(r[0].reason).toContain('10%特例');
  });

  it('戸数60、介護対象7人 → 379', () => {
    const fac = makeFac({ households: 60 });
    const patients = Array.from({ length: 7 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(379);
    expect(r[0].patientCount).toBe(7);
  });

  it('戸数51、介護対象5人 → 10%以下（5≤floor(5.1)=5）なので518', () => {
    const fac = makeFac({ households: 51 });
    const patients = Array.from({ length: 5 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(518);
  });

  it('戸数51、介護対象6人 → 379', () => {
    const fac = makeFac({ households: 51 });
    const patients = Array.from({ length: 6 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(379);
  });

  it('戸数19、介護対象2人 → 20戸未満2人以下なので全員518', () => {
    const fac = makeFac({ households: 19 });
    const patients = Array.from({ length: 2 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(518);
    expect(r[0].reason).toContain('20戸未満');
  });

  it('戸数19、介護対象3人 → 379', () => {
    const fac = makeFac({ households: 19 });
    const patients = Array.from({ length: 3 }, (_, i) => makePatient(`p${i}`, fac.id));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(379);
  });

  it('グループホーム2ユニット、各8人と9人 → 各ユニットで379判定', () => {
    const fac = makeFac({
      type: 'グループホーム',
      units: [
        { id: 'A', name: 'A棟', separateBuilding: true },
        { id: 'B', name: 'B棟', separateBuilding: true },
      ],
    });
    const patientsA = Array.from({ length: 8 }, (_, i) => ({
      ...makePatient(`a${i}`, fac.id),
      unitId: 'A',
    }));
    const patientsB = Array.from({ length: 9 }, (_, i) => ({
      ...makePatient(`b${i}`, fac.id),
      unitId: 'B',
    }));
    const allP = [...patientsA, ...patientsB];
    const visits = allP.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], allP, visits), ym);
    expect(r).toHaveLength(2);
    expect(r.every((g) => g.classification === 379)).toBe(true);
    expect(r.find((g) => g.groupLabel.includes('A棟'))!.patientCount).toBe(8);
    expect(r.find((g) => g.groupLabel.includes('B棟'))!.patientCount).toBe(9);
  });

  it('同じ建物に介護1人、医療1人 → 別集計（介護518・医療650）', () => {
    const fac = makeFac({ households: 30 });
    const pK = makePatient('k', fac.id, '介護');
    const pI = makePatient('i', fac.id, '医療');
    const visits = [makeVisit('k', ym, 5), makeVisit('i', ym, 5)];
    const r = calculateMonth(makeData([fac], [pK, pI], visits), ym);
    expect(r).toHaveLength(2);
    const k = r.find((g) => g.insurance === '介護')!;
    const i = r.find((g) => g.insurance === '医療')!;
    expect(k.classification).toBe(518); // 1人 → 518
    expect(i.classification).toBe(650); // 1人 → 650
  });

  it('医療保険2〜9人 → 320（戸数未入力で10%特例なし）', () => {
    const fac = makeFac({ households: undefined });
    const patients = Array.from({ length: 5 }, (_, i) => makePatient(`p${i}`, fac.id, '医療'));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(320);
  });

  it('医療保険10人以上 → 290', () => {
    const fac = makeFac({ households: undefined });
    const patients = Array.from({ length: 10 }, (_, i) => makePatient(`p${i}`, fac.id, '医療'));
    const visits = patients.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], patients, visits), ym);
    expect(r[0].classification).toBe(290);
  });

  it('介護＋介護予防 合算で人数判定（戸数未入力）', () => {
    const fac = makeFac({ households: undefined });
    const p1 = makePatient('p1', fac.id, '介護');
    const p2 = makePatient('p2', fac.id, '介護予防');
    const visits = [makeVisit('p1', ym, 5), makeVisit('p2', ym, 5)];
    const r = calculateMonth(makeData([fac], [p1, p2], visits), ym);
    expect(r).toHaveLength(1);
    expect(r[0].patientCount).toBe(2);
    expect(r[0].classification).toBe(379);
  });

  it('訪問なしの患者は人数判定に含まれない（戸数未入力）', () => {
    const fac = makeFac({ households: undefined });
    const visited = Array.from({ length: 9 }, (_, i) => makePatient(`v${i}`, fac.id));
    const notVisited = makePatient('nv', fac.id);
    const visits = visited.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], [...visited, notVisited], visits), ym);
    expect(r[0].patientCount).toBe(9);
    expect(r[0].classification).toBe(379);
  });

  it('当月新規追加（10人目）で区分が379→342に変わる', () => {
    const fac = makeFac({ households: 30 });
    const existing = Array.from({ length: 9 }, (_, i) => makePatient(`p${i}`, fac.id));
    const newP: Patient = {
      ...makePatient('new', fac.id),
      startDate: `${ym}-12`,
    };
    const all = [...existing, newP];
    const visits = all.map((p) => makeVisit(p.id, ym, 20));
    const r = calculateMonth(makeData([fac], all, visits), ym);
    expect(r[0].patientCount).toBe(10);
    expect(r[0].classification).toBe(342);
  });
});

describe('棟移動', () => {
  const ym = '2026-05';

  it('別建物扱いの棟間で移動した場合、訪問日の在籍棟で集計される', () => {
    const fac: Facility = {
      id: 'F1',
      name: 'けやきの郷',
      type: 'サ高住',
      households: 30,
      units: [
        { id: 'W', name: '西棟', separateBuilding: true },
        { id: 'E', name: '東棟', separateBuilding: true },
      ],
    };

    // 西棟患者3人
    const west = Array.from({ length: 3 }, (_, i) => ({
      ...makePatient(`w${i}`, fac.id),
      unitId: 'W',
    }));
    // 東棟患者3人
    const east = Array.from({ length: 3 }, (_, i) => ({
      ...makePatient(`e${i}`, fac.id),
      unitId: 'E',
    }));
    // 移動した患者: 5/15に西から東へ移動
    const moved: Patient = {
      ...makePatient('m1', fac.id),
      unitId: 'W', // 元々西棟
    };

    const all = [...west, ...east, moved];
    const visits = [
      ...west.map((p) => makeVisit(p.id, ym, 5)),
      ...east.map((p) => makeVisit(p.id, ym, 20)),
      makeVisit('m1', ym, 20), // 移動後に訪問
    ];

    const data: AppData = {
      schemaVersion: 1,
      facilities: [fac],
      patients: all,
      visits,
      events: [
        {
          id: 'mv1',
          patientId: 'm1',
          kind: '棟ユニット移動',
          date: `${ym}-15`,
          fromFacilityId: fac.id,
          fromUnitId: 'W',
          toFacilityId: fac.id,
          toUnitId: 'E',
        },
      ],
      settings: DEFAULT_SETTINGS,
    };

    const r = calculateMonth(data, ym);
    const w = r.find((g) => g.groupLabel.includes('西棟'))!;
    const e = r.find((g) => g.groupLabel.includes('東棟'))!;
    expect(w.patientCount).toBe(3); // 西棟は3人のまま
    expect(e.patientCount).toBe(4); // 東棟は4人（移動者を含む）
  });

  it('合算扱いの棟間で移動した場合、人数判定には影響しない', () => {
    const fac: Facility = {
      id: 'F1',
      name: 'サンライズ松原',
      type: 'サ高住',
      households: 30,
      units: [
        { id: 'W', name: '西棟', separateBuilding: false },
        { id: 'E', name: '東棟', separateBuilding: false },
      ],
    };
    const west = Array.from({ length: 3 }, (_, i) => ({
      ...makePatient(`w${i}`, fac.id),
      unitId: 'W',
    }));
    const east = Array.from({ length: 3 }, (_, i) => ({
      ...makePatient(`e${i}`, fac.id),
      unitId: 'E',
    }));
    const all = [...west, ...east];
    const visits = all.map((p) => makeVisit(p.id, ym, 5));
    const r = calculateMonth(makeData([fac], all, visits), ym);
    expect(r).toHaveLength(1);
    expect(r[0].patientCount).toBe(6);
  });
});
fac], all, visits), ym);
    expect(r).toHaveLength(1);
    expect(r[0].patientCount).toBe(6);
  });
});
