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
 
// 通し番号方式の区分判定（個別の通し番号でtierを決める）
// 特例（10%、20戸未満、個人宅同一世帯）は全員一律適用される
// prevCount: 前月の同一算定グループの訪問人数。10%・20戸未満特例は
//   前月実績が枠を超えていた場合、当月は適用しない（前月歯止め）。
function classifyBySerial(
  facility: Facility,
  insurance: '介護' | '医療',
  serial: number,
  totalCount: number,
  settings: Settings,
  patients: Patient[],
  prevCount: number = 0
): { value: number; label: string; reason: string; tier: string } {
  let cls = classifyByCount(serial, insurance, settings);
  let reason = `通し番号${serial} → ${cls.label}区分`;
  // tier: なぜその点数かの短い理由（UI表示用）
  let tier =
    serial <= 1 ? '1人区分' : serial <= 9 ? '2〜9人区分' : '10人以上区分';

  // 特例は全員一律
  if (facility.type === '個人宅') {
    const hh = new Map<string, number>();
    for (const p of patients) {
      const h = p.household ?? `__alone_${p.id}`;
      hh.set(h, (hh.get(h) ?? 0) + 1);
    }
    if (Array.from(hh.values()).some((n) => n >= 2)) {
      cls = classifyByCount(1, insurance, settings);
      reason = `個人宅 同一世帯特例: 1人区分（${cls.label}）として算定`;
      tier = '個人宅 同一世帯特例';
    }
  }
  if (facility.households !== undefined && facility.households < 20 && totalCount <= 2) {
    // 前月実績が3人以上（=2人以下の枠を超えていた）なら当月は適用しない
    if (prevCount >= 3) {
      reason = `通し番号${serial} → ${cls.label}区分（前月${prevCount}人で20戸未満特例の枠超のため当月は不適用）`;
    } else {
      cls = classifyByCount(1, insurance, settings);
      reason = `20戸未満2人以下特例: 戸数${facility.households}・対象${totalCount}人 → 1人区分（${cls.label}）として算定`;
      tier = '20戸未満2人以下特例';
    }
  }
  if (facility.households !== undefined && facility.households > 0) {
    const limit = Math.floor(facility.households * 0.1);
    if (totalCount <= limit && totalCount > 0) {
      // 前月実績が戸数の10%枠に達していたら当月は適用しない
      // （前月で枠が埋まっていれば、新規はその先の通し番号で通常区分になる）
      if (prevCount >= limit) {
        reason = `通し番号${serial} → ${cls.label}区分（前月${prevCount}人が10%枠（${limit}人）に達するため当月は10%特例を不適用）`;
      } else {
        cls = classifyByCount(1, insurance, settings);
        reason = `10%特例: 戸数${facility.households}の10%（${limit}人）以下のため1人区分（${cls.label}）として算定`;
        tier = '10%特例';
      }
    }
  }
  return { ...cls, reason, tier };
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
 
export interface CalcOptions {
  // 当月訪問ゼロだが前月実績があるグループも、基準区分のみ（対象0人）で含める
  includePrevOnlyGroups?: boolean;
}

export function calculateMonth(
  data: AppData,
  yearMonth: string,
  options: CalcOptions = {}
): FacilityCalcGroup[] {
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
    const totalCount = items.length;
 
    // 前月人数
    const prevItems = prevGroups.get(key);
    const prevCount = prevItems?.length ?? 0;
 
    // 前月区分（継続者用）
    let prevCls: { value: number; label: string; reason: string; tier: string } | null = null;
    if (prevCount > 0) {
      prevCls = classifyBySerial(facility, insurance, prevCount, prevCount, settings, prevItems!.map((it) => it.patient));
    }
 
    // 当月総数で見た区分（参考表示用）。前月人数で特例の前月歯止めを反映
    const currCls = classifyBySerial(facility, insurance, totalCount, totalCount, settings, items.map((it) => it.patient), prevCount);
 
    // 新規者を訪問日順（同日は患者ID順）でソート、各人に通し番号を振る
    const continuingItems = items.filter((it) => prevVisitedIds.has(it.patient.id));
    const freshItems = items
      .filter((it) => !prevVisitedIds.has(it.patient.id))
      .sort((a, b) => {
        if (a.visit.visitDate !== b.visit.visitDate) {
          return a.visit.visitDate.localeCompare(b.visit.visitDate);
        }
        return a.patient.id.localeCompare(b.patient.id);
      });
 
    // 患者ID → row のマップを作成
    const rowMap = new Map<string, PatientCalcRow>();
    let continuingCount = 0;
    let freshCount = 0;
 
    for (const it of continuingItems) {
      const fallback = prevCls ?? classifyBySerial(facility, insurance, 1, totalCount, settings, items.map((x) => x.patient), prevCount);
      const value = fallback.value;
      rowMap.set(it.patient.id, {
        patientId: it.patient.id,
        patientName: it.patient.name,
        insurance: it.patient.insurance,
        visited: true,
        visitDate: it.visit.visitDate,
        classification: value,
        carriedOver: true,
        note: noteForPatient(it.patient, it.visit, data.events, yearMonth),
        reasonLabel: `前月から継続・据置（前月: ${fallback.tier}）`,
      });
      continuingCount++;
    }

    freshItems.forEach((it, idx) => {
      const serial = prevCount + idx + 1;
      const cls = classifyBySerial(facility, insurance, serial, totalCount, settings, items.map((x) => x.patient), prevCount);
      rowMap.set(it.patient.id, {
        patientId: it.patient.id,
        patientName: it.patient.name,
        insurance: it.patient.insurance,
        visited: true,
        visitDate: it.visit.visitDate,
        classification: cls.value,
        carriedOver: false,
        note: noteForPatient(it.patient, it.visit, data.events, yearMonth) + (it.visit ? ` / 通し番号${serial}` : ''),
        reasonLabel: cls.tier,
      });
      freshCount++;
    });
 
    // 元の順序で並べる
    const rows: PatientCalcRow[] = items.map((it) => rowMap.get(it.patient.id)!);
 
    // 判定根拠
    let reason = `当月訪問${totalCount}人 / 前月${prevCount}人。${currCls.reason}`;
    if (prevCount > 0) {
      reason += ` / 継続者は前月区分(${prevCls!.label})据置、新規者は前月${prevCount}人を引き継いだ通し番号で個別判定`;
    } else {
      reason += ` / 前月実績なし、新規者は通し番号1から開始`;
    }
 
    // サマリーの代表区分: 前月実績があれば前月区分（継続者の据置基準）、
    // なければ当月区分。新規で点数が変わる人は個別の行の点数で確認する。
    const summaryClassification = prevCls?.value ?? currCls.value;

    result.push({
      facilityId: facility.id,
      unitId: facility.units.find((u) => u.id === unitId)?.separateBuilding ? unitId : undefined,
      groupLabel: groupLabel(facility, unitId),
      insurance,
      patientCount: totalCount,
      classification: summaryClassification,
      previousClassification: prevCls?.value ?? null,
      reason,
      rows,
      continuingCount,
      freshCount,
    });
  }

  // 当月訪問ゼロだが前月実績があるグループ: 基準区分のみ（対象0人）で追加
  if (options.includePrevOnlyGroups) {
    for (const [key, prevItems] of prevGroups) {
      if (currGroups.has(key)) continue; // 当月訪問ありは上で処理済み
      const first = prevItems[0];
      const facility = first.facility;
      const unitId = first.unitId;
      const insurance = first.bucket;
      const prevCount = prevItems.length;
      const prevCls = classifyBySerial(
        facility,
        insurance,
        prevCount,
        prevCount,
        settings,
        prevItems.map((it) => it.patient)
      );
      result.push({
        facilityId: facility.id,
        unitId: facility.units.find((u) => u.id === unitId)?.separateBuilding ? unitId : undefined,
        groupLabel: groupLabel(facility, unitId),
        insurance,
        patientCount: 0,
        classification: prevCls.value,
        previousClassification: prevCls.value,
        reason: `当月訪問なし / 前月${prevCount}人。基準区分は前月実績（${prevCls.label}）`,
        rows: [],
        continuingCount: 0,
        freshCount: 0,
      });
    }
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
 
// 患者が当月に棟移動/施設移動したかと、移動日を返す
export function moveEventInMonth(
  patientId: string,
  yearMonth: string,
  events: PatientEvent[]
): PatientEvent | undefined {
  return events
    .filter((e) => e.patientId === patientId && (e.kind === '棟ユニット移動' || e.kind === '施設移動') && e.date.startsWith(yearMonth))
    .sort((a, b) => b.date.localeCompare(a.date))[0]; // 最新の移動
}