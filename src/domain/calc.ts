import {
  AppData,
  Facility,
  FacilityCalcGroup,
  Patient,
  PatientCalcRow,
  PatientEvent,
  Settings,
  VisitRecord,
} from './types';

export function locationOnDate(
  patient: Patient,
  date: string,
  events: PatientEvent[]
): { facilityId: string; unitId?: string } {
  const moves = events
    .filter(
      (e) =>
        e.patientId === patient.id &&
        (e.kind === '棟ユニット移動' || e.kind === '施設移動') &&
        e.date <= date
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (moves.length === 0) {
    return { facilityId: patient.facilityId, unitId: patient.unitId };
  }
  const last = moves[moves.length - 1];
  return {
    facilityId: last.toFacilityId ?? patient.facilityId,
    unitId: last.toUnitId,
  };
}

export function visitOfMonth(
  patientId: string,
  yearMonth: string,
  visits: VisitRecord[]
): VisitRecord | undefined {
  return visits.find((v) => v.patientId === patientId && v.yearMonth === yearMonth);
}

export function previousYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function groupKey(facility: Facility, unitId: string | undefined, insurance: '介護' | '医療'): string {
  const unit = facility.units.find((u) => u.id === unitId);
  const sep = unit?.separateBuilding ?? false;
  return sep ? `${facility.id}/${unitId}/${insurance}` : `${facility.id}/${insurance}`;
}

function groupLabel(facility: Facility, unitId: string | undefined): string {
  const unit = facility.units.find((u) => u.id === unitId);
  if (unit?.separateBuilding) return `${facility.name} ${unit.name}`;
  return facility.name;
}

function insuranceBucket(p: Patient): '介護' | '医療' | null {
  if (p.insurance === '介護' || p.insurance === '介護予防') return '介護';
  if (p.insurance === '医療') return '医療';
  return null;
}

function classifyByCount(count: number, insurance: '介護' | '医療', settings: Settings): { value: number; label: string } {
  if (insurance === '介護') {
    if (count <= 1) return { value: settings.kaigoUnits.single, label: '518' };
    if (count <= 9) return { value: settings.kaigoUnits.group2to9, label: '379' };
    return { value: settings.kaigoUnits.group10plus, label: '342' };
  } else {
    if (count <= 1) return { value: settings.iryoPoints.single, label: '650' };
    if (count <= 9) return { value: settings.iryoPoints.group2to9, label: '320' };
    return { value: settings.iryoPoints.group10plus, label: '290' };
  }
}

function classifyWithExceptions(
  facility: Facility,
  insurance: '介護' | '医療',
  count: number,
  settings: Settings,
  patients: Patient[]
): { value: number; label: string; reason: string } {
  if (count === 0) return { value: 0, label: '—', reason: '対象なし' };
  let cls = classifyByCount(count, insurance, settings);
  let reason = `${insurance}保険 算定対象 ${count}人 → ${cls.label}区分`;
  if (facility.type === '個人宅') {
    const hh = new Map<string, number>();
    for (const p of patients) {
      const h = p.household ?? `__alone_${p.id}`;
      hh.set(h, (hh.get(h) ?? 0) + 1);
    }
    if (Array.from(hh.values()).some((n) => n >= 2)) {
      cls = classifyByCount(1, insurance, settings);
      reason = `個人宅 同一世帯特例: 各患者を1人区分（${cls.label}）として算定`;
    }
  }
  if (facility.households !== undefined && facility.households < 20 && count <= 2) {
    cls = classifyByCount(1, insurance, settings);
    reason = `20戸未満2人以下特例: 戸数${facility.households}・対象${count}人 → 各患者を1人区分（${cls.label}）として算定`;
  }
  if (facility.households !== undefined && facility.households > 0) {
    const limit = Math.floor(facility.households * 0.1);
    if (count <= limit && count > 0) {
      cls = classifyByCount(1, insurance, settings);
      reason = `10%特例: 戸数${facility.households}の10%（${limit}人）以下のため各患者を1人区分（${cls.label}）として算定`;
    }
  }
  return { ...cls, reason };
}

interface Eligible {
  patient: Patient;
  visit: VisitRecord;
  facility: Facility;
  unitId?: string;
  bucket: '介護' | '医療';
}

function eligiblesOfMonth(data: AppData, yearMonth: string): Eligible[] {
  const out: Eligible[] = [];
  for (const p of data.patients) {
    if (p.hidden) continue;
    const v = visitOfMonth(p.id, yearMonth, data.visits);
    if (!v) continue;
    const bucket = insuranceBucket(p);
    if (!bucket) continue;
    const loc = locationOnDate(p, v.visitDate, data.events);
    const facility = data.facilities.find((f) => f.id === loc.facilityId);
    if (!facility) continue;
    out.push({ patient: p, visit: v, facility, unitId: loc.unitId, bucket });
  }
  return out;
}

export function calculateMonth(data: AppData, yearMonth: string): FacilityCalcGroup[] {
  const settings = data.settings;
  const prevYm = previousYearMonth(yearMonth);
  const currEligibles = eligiblesOfMonth(data, yearMonth);
  const prevEligibles = eligiblesOfMonth(data, prevYm);
  const currGroups = new Map<string, Eligible[]>();
  for (const e of currEligibles) {
    const k = groupKey(e.facility, e.unitId, e.bucket);
    const arr = currGroups.get(k) ?? [];
    arr.push(e);
    currGroups.set(k, arr);
  }
  const prevGroups = new Map<string, Eligible[]>();
  for (const e of prevEligibles) {
    const k = groupKey(e.facility, e.unitId, e.bucket);
    const arr = prevGroups.get(k) ?? [];
    arr.push(e);
    prevGroups.set(k, arr);
  }
  const prevVisitedIds = new Set(prevEligibles.map((e) => e.patient.id));
  const result: FacilityCalcGroup[] = [];
  for (const [key, items] of currGroups) {
    const first = items[0];
    const facility = first.facility;
    const unitId = first.unitId;
    const insurance = first.bucket;
    const count = items.length;
    const currCls = classifyWithExceptions(facility, insurance, count, settings, items.map((it) => it.patient));
    let prevCls: { value: number; label: string; reason: string } | null = null;
    const prevItems = prevGroups.get(key);
    if (prevItems && prevItems.length > 0) {
      prevCls = classifyWithExceptions(facility, insurance, prevItems.length, settings, prevItems.map((it) => it.patient));
    }
    let continuingCount = 0;
    let freshCount = 0;
    const rows: PatientCalcRow[] = items.map((it) => {
      const wasInPrev = prevVisitedIds.has(it.patient.id);
      let value: number;
      let carriedOver: boolean;
      if (wasInPrev && prevCls) {
        value = prevCls.value;
        carriedOver = true;
        continuingCount++;
      } else {
        if (prevCls) {
          value = Math.min(currCls.value, prevCls.value);
        } else {
          value = currCls.value;
        }
        carriedOver = false;
        freshCount++;
      }
      return {
        patientId: it.patient.id,
        patientName: it.patient.name,
        insurance: it.patient.insurance,
        visited: true,
        visitDate: it.visit.visitDate,
        classification: value,
        carriedOver,
        note: noteForPatient(it.patient, it.visit, data.events, yearMonth),
      };
    });
    let reason = currCls.reason;
    if (prevCls && currCls.value !== prevCls.value) {
      if (currCls.value < prevCls.value) {
        reason += ` / 前月は${prevCls.label}区分。点数下がる方向のため新規者にも当月区分を適用、継続者は前月区分据置`;
      } else {
        reason += ` / 前月は${prevCls.label}区分。点数上がる方向のため当月は前月区分（${prevCls.label}）を継続適用、翌月から${currCls.label}に切替`;
      }
    } else if (prevCls) {
      reason += ` / 前月と同じ区分`;
    } else {
      reason += ` / 前月実績なし（全員新規扱い）`;
    }
    result.push({
      facilityId: facility.id,
      unitId: facility.units.find((u) => u.id === unitId)?.separateBuilding ? unitId : undefined,
      groupLabel: groupLabel(facility, unitId),
      insurance,
      patientCount: count,
      classification: currCls.value,
      previousClassification: prevCls?.value ?? null,
      reason,
      rows,
      continuingCount,
      freshCount,
    });
  }
  result.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel, 'ja'));
  return result;
}

function noteForPatient(p: Patient, _v: VisitRecord, events: PatientEvent[], yearMonth: string): string {
  const notes: string[] = [];
  if (p.startDate && p.startDate.startsWith(yearMonth) && p.startDate > '0000-00-00') {
    notes.push(`新規 ${p.startDate.slice(5).replace('-', '/')}〜`);
  }
  const adm = events.find((e) => e.patientId === p.id && e.kind === '入院' && e.date.startsWith(yearMonth));
  if (adm) notes.push(`${adm.date.slice(5).replace('-', '/')}入院`);
  const mv = events.find((e) => e.patientId === p.id && (e.kind === '棟ユニット移動' || e.kind === '施設移動') && e.date.startsWith(yearMonth));
  if (mv) notes.push(`${mv.date.slice(5).replace('-', '/')}移動`);
  return notes.join(' / ');
}

export function excludedPatientsOfMonth(data: AppData, yearMonth: string): { patient: Patient; reason: string }[] {
  const result: { patient: Patient; reason: string }[] = [];
  for (const p of data.patients) {
    if (p.hidden) continue;
    if (p.status !== '訪問対象' && p.status !== '退院予定') continue;
    const v = visitOfMonth(p.id, yearMonth, data.visits);
    if (v) continue;
    if (p.startDate && p.startDate.startsWith(yearMonth)) {
      result.push({ patient: p, reason: `${p.startDate.slice(5).replace('-', '/')}開始・訪問なし → 人数判定から除外` });
    }
  }
  return result;
}

export function warnings(data: AppData, yearMonth: string): string[] {
  const warns: string[] = [];
  for (const f of data.facilities) {
    if (f.hidden) continue;
    if (f.households === undefined || f.households === 0) {
      const has = data.patients.some((p) => p.facilityId === f.id && !p.hidden && visitOfMonth(p.id, yearMonth, data.visits));
      if (has) warns.push(`施設「${f.name}」の戸数が未入力です。10%特例の自動判定ができません。`);
    }
  }
  return warns;
}

export function applyGroupHomeRule(facility: Facility): Facility {
  if (facility.type === 'グループホーム' && facility.units.length > 0 && facility.units.length <= 3) {
    return { ...facility, units: facility.units.map((u) => ({ ...u, separateBuilding: true })) };
  }
  return facility;
}

export function visitedPreviousMonth(patientId: string, yearMonth: string, visits: VisitRecord[]): boolean {
  const prev = previousYearMonth(yearMonth);
  return visits.some((v) => v.patientId === patientId && v.yearMonth === prev);
}