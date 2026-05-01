// ダミーデータ（実在患者名は使わない）
import { AppData, DEFAULT_SETTINGS, Facility, Patient, VisitRecord } from './types';

export function makeSeed(): AppData {
  const facilities: Facility[] = [
    {
      id: 'fac_sun',
      name: 'サンライズ松原',
      building: '松原ビル',
      type: '有料老人ホーム',
      households: 60,
      units: [],
    },
    {
      id: 'fac_keyaki',
      name: 'けやきの郷',
      building: 'けやきハイツ',
      type: 'サ高住',
      households: 30,
      units: [
        { id: 'unit_w', name: '西棟', separateBuilding: false },
        { id: 'unit_e', name: '東棟', separateBuilding: false },
      ],
    },
    {
      id: 'fac_gh',
      name: 'GH 桜の木',
      type: 'グループホーム',
      households: 18,
      units: [
        { id: 'unit_a', name: 'A棟', separateBuilding: true },
        { id: 'unit_b', name: 'B棟', separateBuilding: true },
      ],
    },
    {
      id: 'fac_home',
      name: 'けやきハイツ（個人宅）',
      type: '個人宅',
      households: 19,
      units: [],
    },
  ];

  const patients: Patient[] = [
    // サンライズ松原（介護）
    { id: 'p1', name: '山田 太郎', kana: 'ヤマダ タロウ', facilityId: 'fac_sun', insurance: '介護', status: '訪問対象', startDate: '2024-04-01' },
    { id: 'p2', name: '鈴木 花子', kana: 'スズキ ハナコ', facilityId: 'fac_sun', insurance: '介護', status: '訪問対象', startDate: '2024-05-10' },
    { id: 'p3', name: '佐藤 一郎', kana: 'サトウ イチロウ', facilityId: 'fac_sun', insurance: '介護予防', status: '訪問対象', startDate: '2024-06-01' },
    { id: 'p4', name: '高橋 美智子', kana: 'タカハシ ミチコ', facilityId: 'fac_sun', insurance: '介護', status: '訪問対象', startDate: '2024-07-15' },
    { id: 'p5', name: '田中 健', kana: 'タナカ ケン', facilityId: 'fac_sun', insurance: '介護', status: '訪問対象', startDate: '2024-08-01' },
    { id: 'p6', name: '伊藤 久子', kana: 'イトウ ヒサコ', facilityId: 'fac_sun', insurance: '介護', status: '入院中', startDate: '2024-09-01', admissionDate: '2026-04-22' },
    // 医療
    { id: 'p7', name: '渡辺 三郎', kana: 'ワタナベ サブロウ', facilityId: 'fac_sun', insurance: '医療', status: '訪問対象', startDate: '2024-06-01' },
    { id: 'p8', name: '中村 京子', kana: 'ナカムラ キョウコ', facilityId: 'fac_sun', insurance: '医療', status: '訪問対象', startDate: '2024-10-01' },

    // けやきの郷
    { id: 'p10', name: '小林 文子', kana: 'コバヤシ フミコ', facilityId: 'fac_keyaki', unitId: 'unit_w', insurance: '介護', status: '訪問対象', startDate: '2025-02-10' },
    { id: 'p11', name: '加藤 宏', kana: 'カトウ ヒロシ', facilityId: 'fac_keyaki', unitId: 'unit_w', insurance: '介護', status: '訪問対象', startDate: '2025-03-01' },
    { id: 'p12', name: '吉田 静子', kana: 'ヨシダ シズコ', facilityId: 'fac_keyaki', unitId: 'unit_e', insurance: '介護', status: '訪問対象', startDate: '2025-04-01' },
    { id: 'p13', name: '山本 進', kana: 'ヤマモト ススム', facilityId: 'fac_keyaki', unitId: 'unit_e', insurance: '介護', status: '訪問対象', startDate: '2025-05-01' },
    { id: 'p14', name: '井上 春子', kana: 'イノウエ ハルコ', facilityId: 'fac_keyaki', unitId: 'unit_w', insurance: '介護予防', status: '訪問対象', startDate: '2025-11-01' },

    // GH 桜の木
    { id: 'p20', name: '森田 政夫', kana: 'モリタ マサオ', facilityId: 'fac_gh', unitId: 'unit_a', insurance: '介護', status: '訪問対象', startDate: '2025-06-01' },
    { id: 'p21', name: '森田 節子', kana: 'モリタ セツコ', facilityId: 'fac_gh', unitId: 'unit_a', insurance: '介護', status: '訪問対象', startDate: '2025-06-01' },
    { id: 'p22', name: '小川 良子', kana: 'オガワ ヨシコ', facilityId: 'fac_gh', unitId: 'unit_b', insurance: '介護', status: '訪問対象', startDate: '2025-07-01' },

    // 個人宅
    { id: 'p30', name: '松本 茂', kana: 'マツモト シゲル', facilityId: 'fac_home', insurance: '介護', status: '訪問対象', startDate: '2025-08-01' },
  ];

  // 当月（実装時の今月）の訪問データはあえて作らず、ユーザーがタップで作成する想定
  const visits: VisitRecord[] = [];

  return {
    schemaVersion: 1,
    facilities,
    patients,
    visits,
    events: [],
    settings: DEFAULT_SETTINGS,
  };
}
