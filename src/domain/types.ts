// ドメインモデル定義
// すべての画面・計算ロジックで使う型

export type FacilityType =
  | '一般施設'
  | '有料老人ホーム'
  | 'サ高住'
  | 'グループホーム'
  | '個人宅'
  | 'その他';

export type InsuranceKind = '介護' | '介護予防' | '医療' | '対象外';

export type PatientStatus =
  | '訪問対象'
  | '入院中'
  | '退院予定'
  | '終了'
  | '死亡'
  | '一時停止';

export type EventKind =
  | '入院'
  | '退院'
  | '施設入所'
  | '施設退所'
  | '死亡'
  | '訪問開始'
  | '訪問終了'
  | '一時停止'
  | '再開'
  | '棟ユニット移動'
  | '施設移動';

export interface Unit {
  id: string;
  name: string;
  // 別建物として算定（人数判定を分ける）
  // グループホームでユニット数≤3 の場合は強制 true
  separateBuilding: boolean;
}

export interface Facility {
  id: string;
  name: string;
  building?: string; // 建物名
  type: FacilityType;
  households?: number; // 戸数（10%特例の判定に使う、未入力可）
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
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  admissionDate?: string;
  dischargeDate?: string;
  household?: string; // 個人宅の同一世帯識別子
  note?: string;
  hidden?: boolean;
}

export interface VisitRecord {
  id: string;
  patientId: string;
  yearMonth: string; // 'YYYY-MM'
  visitDate: string; // 'YYYY-MM-DD'
}

export interface PatientEvent {
  id: string;
  patientId: string;
  kind: EventKind;
  date: string;
  // 棟ユニット移動・施設移動の場合
  fromFacilityId?: string;
  fromUnitId?: string;
  toFacilityId?: string;
  toUnitId?: string;
  memo?: string;
}

export interface Settings {
  schemaVersion: number;
  kaigoUnits: {
    single: number; // 単一建物 1人 (518)
    group2to9: number; // 2〜9人 (379)
    group10plus: number; // 10人以上 (342)
    online: number; // オンライン (46) — 参考値として保持
  };
  iryoPoints: {
    single: number; // 単一建物 1人 (650)
    group2to9: number; // 2〜9人 (320)
    group10plus: number; // 10人以上 (290)
  };
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

// 区分判定の結果
export interface ClassifyResult {
  // 単位数または点数
  value: number;
  // 区分名（518 / 379 / 342 / 650 / 320 / 290 など）
  label: string;
  // 判定理由
  reason: string;
  // 集計対象キー（同じ建物として判定するグループの識別）
  groupKey: string;
}

export interface FacilityCalcGroup {
  facilityId: string;
  unitId?: string; // 別建物判定の場合のみセット
  groupLabel: string; // "サンライズ松原" or "けやきの郷 西棟"
  insurance: '介護' | '医療';
  patientCount: number;
  classification: number; // 518/379/342/650/320/290
  reason: string;
  rows: PatientCalcRow[];
}

export interface PatientCalcRow {
  patientId: string;
  patientName: string;
  insurance: InsuranceKind;
  visited: boolean;
  visitDate?: string;
  classification: number | null;
  note: string;
}
