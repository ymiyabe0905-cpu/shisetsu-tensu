// 計算エンジン
// UI から完全に独立した純粋関数

import {
  AppData,
  Facility,
  FacilityCalcGroup,
  InsuranceKind,
  Patient,
  PatientCalcRow,
  PatientEvent,
  Settings,
  Unit,
  VisitRecord,
} from './types';

// 訪問日時点での所在を返す
export function locationOnDate(
  patient: Patient,
  date: string,
  events: PatientEvent[]
): { facilityId: string; unitId?: string } {
  // 移動イベントを日付順で適用
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

// 当月の訪問記録を取得
export function visitOfMonth(
  patientId: string,
  yearMonth: string,
  visits: VisitRecord[]
): VisitRecord | undefined {
  return visits.find((v) => v.patientId === patientId && v.yearMonth === yearMonth);
}

// 集計対象キーを作る
// 別建物として算定する棟は「facilityId/unitId」、合算は「facilityId」
function groupKey(
  facility: Facility,
  unitId: string | undefined,
  insurance: '介護' | '医療'
): string {
  const unit = facility.units.find((u) => u.id === unitId);
  const sep = unit?.separateBuilding ?? false;
  return sep ? `${facility.id}/${unitId}/${insurance}` : `${facility.id}/${insurance}`;
}

function groupLabel(facility: Facility, unitId: string | undefined): string {
  const unit = facility.units.find((u) => u.id === unitId);
  if (unit?.separateBuilding) {
    return `${facility.name} ${unit.name}`;
  }
  return facility.name;
}

// 患者の保険を「介護(=介護+介護予防)」「医療」に正規化
function insuranceBucket(p: Patient): '介護' | '医療' | null {
  if (p.insurance === '介護' || p.insurance === '介護予防') return '介護';
  if (p.insurance === '医療') return '医療';
  return null;
}

// 区分を決定
// count: 同一建物内の算定対象人数
function classifyByCount(
  count: number,
  insurance: '介護' | '医療',
  settings: Settings
): { value: number; label: string } {
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

// 月計算のメイン関数
export function calculateMonth(data: AppData, yearMonth: string): FacilityCalcGroup[] {
  const { facilities, patients, visits, events, settings } = data;

  // 1. 訪問実績ありの患者のみを抽出（当月）
  type Eligible = {
    patient: Patient;
    visit: VisitRecord;
    facility: Facility;
    unitId?: string;
    bucket: '介護' | '医療';
  };

  const eligibles: Eligible[] = [];

  for (const p of patients) {
    if (p.hidden) continue;
    const v = visitOfMonth(p.id, yearMonth, visits);
    if (!v) continue;
    const bucket = insuranceBucket(p);
    if (!bucket) continue;
    const loc = locationOnDate(p, v.visitDate, events);
    const facility = facilities.find((f) => f.id === loc.facilityId);
    if (!facility) continue;
    eligibles.push({ patient: p, visit: v, facility, unitId: loc.unitId, bucket });
  }

  // 2. グループ化（区分判定の単位）
  const groups = new Map<string, Eligible[]>();
  for (const e of eligibles) {
    const k = groupKey(e.facility, e.unitId, e.bucket);
    const arr = groups.get(k) ?? [];
    arr.push(e);
    groups.set(k, arr);
  }

  // 3. 各グループに対して区分判定
  const result: FacilityCalcGroup[] = [];

  for (const [, items] of groups) {
    const first = items[0];
    const facility = first.facility;
    const unitId = first.unitId;
    const insurance = first.bucket;

    let count = items.length;
    let cls = classifyByCount(count, insurance, settings);
    let reason = `${insurance}保険 算定対象 ${count}人 → ${cls.label}区分`;

    // ----- 特例適用 -----
    // ① 個人宅 同一世帯 → 各患者を1人区分
    let perPatientOverride: Map<string, { value: number; label: string; reason: string }> | null = null;
    if (facility.type === '個人宅') {
      const householdGroups = new Map<string, number>();
      for (const it of items) {
        const h = it.patient.household ?? `__alone_${it.patient.id}`;
        householdGroups.set(h, (householdGroups.get(h) ?? 0) + 1);
      }
      const hasMulti = Array.from(householdGroups.values()).some((n) => n >= 2);
      if (hasMulti) {
        // 各世帯1人区分
        cls = classifyByCount(1, insurance, settings);
        reason = `個人宅 同一世帯特例: 各患者を1人区分（${cls.label}）として算定`;
      }
    }

    // ② 戸数 20戸未満かつ算定対象 2人以下 → 全員1人区分
    if (facility.households !== undefined && facility.households < 20 && count <= 2) {
      cls = classifyByCount(1, insurance, settings);
      reason = `20戸未満2人以下特例: 戸数${facility.households}・対象${count}人 → 各患者を1人区分（${cls.label}）として算定`;
    }

    // ③ 10%特例（戸数の10%以下）
    if (facility.households !== undefined && facility.households > 0) {
      const limit = Math.floor(facility.households * 0.1);
      if (count <= limit && count > 0) {
        cls = classifyByCount(1, insurance, settings);
        reason = `10%特例: 戸数${facility.households}の10%（${limit}人）以下のため各患者を1人区分（${cls.label}）として算定`;
      }
    }

    // ④ グループホーム ユニット数≤3 → ユニット別判定（既にグループ化されているはず、別建物としてマーク済み）
    //    施設フォーム保存時に別建物フラグが立てられているのでここでは処理不要

    // 個別オーバーライド適用判定はここでは不要（特例は全員一律のため）
    void perPatientOverride;

    const rows: PatientCalcRow[] = items.map((it) => ({
      patientId: it.patient.id,
      patientName: it.patient.name,
      insurance: it.patient.insurance,
      visited: true,
      visitDate: it.visit.visitDate,
      classification: cls.value,
      note: noteForPatient(it.patient, it.visit, events, yearMonth),
    }));

    // 訪問なしの患者（除外として表示用に追加）はここでは含めない
    // → 計算結果画面で別途取得

    result.push({
      facilityId: facility.id,
      unitId: facility.units.find((u) => u.id === unitId)?.separateBuilding ? unitId : undefined,
      groupLabel: groupLabel(facility, unitId),
      insurance,
      patientCount: count,
      classification: cls.value,
      reason,
      rows,
    });
  }

  // 表示順を施設順に
  result.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel, 'ja'));
  return result;
}

function noteForPatient(
  p: Patient,
  v: VisitRecord,
  events: PatientEvent[],
  yearMonth: string
): string {
  const notes: string[] = [];
  // 当月開始
  if (p.startDate && p.startDate.startsWith(yearMonth) && p.startDate > '0000-00-00') {
    const md = p.startDate.slice(5).replace('-', '/');
    notes.push(`新規 ${md}〜`);
  }
  // 当月入院
  const adm = events.find(
    (e) => e.patientId === p.id && e.kind === '入院' && e.date.startsWith(yearMonth)
  );
  if (adm) {
    notes.push(`${adm.date.slice(5).replace('-', '/')}入院`);
  }
  // 当月移動
  const mv = events.find(
    (e) =>
      e.patientId === p.id &&
      (e.kind === '棟ユニット移動' || e.kind === '施設移動') &&
      e.date.startsWith(yearMonth)
  );
  if (mv) {
    notes.push(`${mv.date.slice(5).replace('-', '/')}移動`);
  }
  return notes.join(' / ');
}

// 当月開始だが訪問なしの患者を「除外」として返す
export function excludedPatientsOfMonth(
  data: AppData,
  yearMonth: string
): { patient: Patient; reason: string }[] {
  const result: { patient: Patient; reason: string }[] = [];
  for (const p of data.patients) {
    if (p.hidden) continue;
    if (p.status !== '訪問対象' && p.status !== '退院予定') continue;
    const v = visitOfMonth(p.id, yearMonth, data.visits);
    if (v) continue;
    if (p.startDate && p.startDate.startsWith(yearMonth)) {
      result.push({
        patient: p,
        reason: `${p.startDate.slice(5).replace('-', '/')}開始・訪問なし → 人数判定から除外`,
      });
    }
  }
  return result;
}

// 戸数未入力で10%特例が適用できない施設を警告として返す
export function warnings(data: AppData, yearMonth: string): string[] {
  const warns: string[] = [];
  for (const f of data.facilities) {
    if (f.hidden) continue;
    if (f.households === undefined || f.households === 0) {
      // 当月訪問対象患者がいるか確認
      const has = data.patients.some(
        (p) =>
          p.facilityId === f.id &&
          !p.hidden &&
          visitOfMonth(p.id, yearMonth, data.visits)
      );
      if (has) {
        warns.push(`施設「${f.name}」の戸数が未入力です。10%特例の自動判定ができません。`);
      }
    }
  }
  return warns;
}

// グループホーム ユニット数≤3 の場合、各ユニットを「別建物」として強制
// 施設保存時に呼ぶヘルパー
export function applyGroupHomeRule(facility: Facility): Facility {
  if (facility.type === 'グループホーム' && facility.units.length > 0 && facility.units.length <= 3) {
    return {
      ...facility,
      units: facility.units.map((u) => ({ ...u, separateBuilding: true })),
    };
  }
  return facility;
}
