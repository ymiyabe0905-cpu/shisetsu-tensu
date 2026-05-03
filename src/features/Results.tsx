import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { calculateMonth, excludedPatientsOfMonth, warnings } from '../domain/calc';
import { thisMonth, ymToLabel, downloadFile, dateToMd } from '../utils';
import { MonthPicker } from '../components/MonthPicker';

export function Results() {
  const { data } = useStore();
  const [ym, setYm] = useState(thisMonth());

  const calc = useMemo(() => calculateMonth(data, ym), [data, ym]);
  const excluded = useMemo(() => excludedPatientsOfMonth(data, ym), [data, ym]);
  const warns = useMemo(() => warnings(data, ym), [data, ym]);

  function exportCsv() {
    const rows: string[] = [];
    rows.push(['施設・棟', '保険', '患者名', 'フリガナ', '訪問日', '区分', '継続/新規', '備考'].join(','));
    for (const g of calc) {
      for (const r of g.rows) {
        const p = data.patients.find((x) => x.id === r.patientId);
        rows.push([
          csv(g.groupLabel),
          csv(g.insurance),
          csv(r.patientName),
          csv(p?.kana ?? ''),
          csv(r.visitDate ?? ''),
          String(r.classification ?? ''),
          r.carriedOver ? '継続' : '新規',
          csv(r.note),
        ].join(','));
      }
    }
    for (const e of excluded) {
      rows.push([
        csv(data.facilities.find((f) => f.id === e.patient.facilityId)?.name ?? ''),
        csv(e.patient.insurance), csv(e.patient.name), csv(e.patient.kana ?? ''),
        '', '', '除外', csv(e.reason),
      ].join(','));
    }
    const bom = '\uFEFF';
    downloadFile(`計算結果_${ym}.csv`, bom + rows.join('\n'), 'text/csv');
  }

  function printPage() { window.print(); }

  return (
    <div>
      <div className="page-header">
        <h2>計算結果</h2>
        <div className="hstack">
          <button className="btn" onClick={exportCsv}>CSV出力</button>
          <button className="btn" onClick={printPage}>印刷</button>
          <MonthPicker value={ym} onChange={setYm} />
        </div>
      </div>

      <div className="alert info no-print" style={{ fontSize: 12 }}>
        ※ このアプリは請求前チェック用の補助ツールです。最終請求はレセコンと制度確認を前提にしてください。
      </div>

      {warns.map((w, i) => (
        <div className="alert warn" key={i}>{w}</div>
      ))}

      {calc.length === 0 && excluded.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--c-text-2)' }}>{ymToLabel(ym)} の訪問実績がありません</div>
      )}

      {calc.map((g, i) => {
        const continuing = g.rows.filter((r) => r.carriedOver);
        const fresh = g.rows.filter((r) => !r.carriedOver);
        return (
          <div className="card" key={i}>
            <div className="card-head">
              <div>
                <div className="name">{g.groupLabel}</div>
                <div className="meta">
                  {g.insurance}保険 ・ {ymToLabel(ym)} ・ 算定 {g.rows.length}人（継続{g.continuingCount}/新規{g.freshCount}）
                </div>
              </div>
              <div className="summary">
                <span className="judge">当月区分: <b>{g.classification}</b></span>
                {g.previousClassification !== null && g.previousClassification !== g.classification && (
                  <span className="judge">前月区分: <b>{g.previousClassification}</b></span>
                )}
              </div>
            </div>

            {continuing.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', margin: '6px 0' }}>
                  前月から継続（前月区分を据置）
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>患者名</th><th>保険</th><th>訪問日</th><th className="num">区分</th><th>備考</th></tr>
                    </thead>
                    <tbody>
                      {continuing.map((r) => {
                        const p = data.patients.find((x) => x.id === r.patientId);
                        return (
                          <tr key={r.patientId}>
                            <td><div className="nm">{r.patientName}</div><div className="kn">{p?.kana ?? ''}</div></td>
                            <td>{r.insurance}</td>
                            <td>{r.visitDate ? dateToMd(r.visitDate) : '—'}</td>
                            <td className="num">{r.classification}</td>
                            <td>{r.note || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {fresh.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-primary-d)', margin: '10px 0 6px' }}>
                  新規訪問（当月区分または前月区分の低い方を適用）
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>患者名</th><th>保険</th><th>訪問日</th><th className="num">区分</th><th>備考</th></tr>
                    </thead>
                    <tbody>
                      {fresh.map((r) => {
                        const p = data.patients.find((x) => x.id === r.patientId);
                        return (
                          <tr key={r.patientId}>
                            <td><div className="nm">{r.patientName}</div><div className="kn">{p?.kana ?? ''}</div></td>
                            <td>{r.insurance}</td>
                            <td>{r.visitDate ? dateToMd(r.visitDate) : '—'}</td>
                            <td className="num">{r.classification}</td>
                            <td>{r.note || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="reason">{g.reason}</div>
          </div>
        );
      })}

      {excluded.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="name">人数判定から除外した患者</div>
              <div className="meta">当月開始だが訪問実績なし</div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>患者名</th><th>施設</th><th>保険</th><th>除外理由</th></tr></thead>
              <tbody>
                {excluded.map((e) => {
                  const fac = data.facilities.find((f) => f.id === e.patient.facilityId);
                  return (
                    <tr key={e.patient.id}>
                      <td>{e.patient.name}</td>
                      <td>{fac?.name ?? '—'}</td>
                      <td>{e.patient.insurance}</td>
                      <td>{e.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function csv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}