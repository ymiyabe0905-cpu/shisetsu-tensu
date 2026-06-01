export type FacilityType = '一般施設' | '有料老人ホーム' | 'サ高住' | 'グループホーム' | '個人宅' | 'その他';
export type InsuranceKind = '介護' | '介護予防' | '医療' | '対象外';
export type PatientStatus = '訪問対象' | '入院中' | '退院予定' | '終了' | '死亡' | '一時停止';
export type EventKind = '入院' | '退院' | '施設入所' | '施設退所' | '死亡' | '訪問開始' | '訪問終了' | '一時停止' | '再開' | '棟ユニット移動' | '施設移動';

export interface Unit {
  id: string;
  name: string;
  separateBuilding: boolean;
}

export interface Facility {
  id: string;
  name: string;
  building?: string;
  type: FacilityType;
  households?: number;
  units: Unit[];
  hidden?: boolean;
}

export interface Patient {
  id: string;
  name: string;
  kana?: string;
  facilityId: string;
  unitId?: string;
  insurance: InsuranceKind;
  status: PatientStatus;
  startDate?: string;
  endDate?: string;
  admissionDate?: string;
  dischargeDate?: string;
  household?: string;
  note?: string;
  hidden?: boolean;
}

export interface VisitRecord {
  id: string;
  patientId: string;
  yearMonth: string;
  visitDate: string;
}

export interface PatientEvent {
  id: string;
  patientId: string;
  kind: EventKind;
  date: string;
  fromFacilityId?: string;
  fromUnitId?: string;
  toFacilityId?: string;
  toUnitId?: string;
  memo?: string;
}

export interface Settings {
  schemaVersion: number;
  kaigoUnits: { single: number; group2to9: number; group10plus: number; online: number };
  iryoPoints: { single: number; group2to9: number; group10plus: number };
}

export interface AppData {
  schemaVersion: number;
  facilities: Facility[];
  patients: Patient[];
  visits: VisitRecord[];
  events: PatientEvent[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  kaigoUnits: { single: 518, group2to9: 379, group10plus: 342, online: 46 },
  iryoPoints: { single: 650, group2to9: 320, group10plus: 290 },
};

export interface FacilityCalcGroup {
  facilityId: string;
  unitId?: string;
  groupLabel: string;
  insurance: '介護' | '医療';
  patientCount: number;
  classification: number;
  reason: string;
  rows: PatientCalcRow[];
  previousClassification: number | null;
  continuingCount: number;
  freshCount: number;
}

export interface PatientCalcRow {
  patientId: string;
  patientName: string;
  insurance: InsuranceKind;
  visited: boolean;
  visitDate?: string;
  classification: number | null;
  carriedOver: boolean;
  note: string;
  // なぜその点数になったかの短い理由（例: 「2〜9人区分」「10%特例」「前月から継続・据置」）
  reasonLabel: string;
}