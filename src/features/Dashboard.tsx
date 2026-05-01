import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { calculateMonth } from '../domain/calc';
import { thisMonth } from '../utils';
import { MonthPicker } from '../components/MonthPicker';

export function Dashboard() {
  const { data } = useStore();
  const [ym, setYm] = useState(thisMonth());

  const calc = useMemo(() => calculateMonth(data, ym), [data, ym]);

  // 集計
  const totalPatients = data.patients.filter((p) => !p.hidden).length;
  const visitedCount = calc.reduce((a, g) => a + g.rows.length, 0);

  // 施設ごとの区分人数を集計（介護=単位、医療=点）
  // 区分カウント
  const buckets = { '518': 0, '379': 0, '342': 0, '650': 0, '320': 0, '290': 0 } as Record<string, number>;
  for (const g of calc) {
    const key = String(g.classification);
    if (buckets[key] !== undefined) buckets[key] += g.rows.length;
  }

  return (
    <div>
      <div className="page-header">
        <h2>ダッシュボード</h2>
        <MonthPicker value={ym} onChange={setYm} />
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="l">総患者数</div>
          <div className="v">
            {totalPatients}
            <span className="u">人</span>
          </div>
        </div>
        <div className="metric">
          <div className="l">訪問実績あり</div>
          <div className="v">
            {visitedCount}
            <span className="u">人</span>
          </div>
        </div>
        <div className="metric">
          <div className="l">介護 算定対象</div>
          <div className="v">
            {calc.filter((g) => g.insurance === '介護').reduce((a, g) => a + g.rows.length, 0)}
            <span className="u">人</span>
          </div>
        </div>
        <div className="metric">
          <div className="l">医療 算定対象</div>
          <div className="v">
            {calc.filter((g) => g.insurance === '医療').reduce((a, g) => a + g.rows.length, 0)}
            <span className="u">人</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">施設ごとの区分人数</div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>施設・棟</th>
                <th>保険</th>
                <th className="num">対象人数</th>
                <th className="num">区分</th>
              </tr>
            </thead>
            <tbody>
              {calc.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--c-text-2)', textAlign: 'center' }}>
                    {ym} の訪問実績がありません
                  </td>
                </tr>
              )}
              {calc.map((g, i) => (
                <tr key={i}>
                  <td>{g.groupLabel}</td>
                  <td>{g.insurance}</td>
                  <td className="num">{g.rows.length}</td>
                  <td className="num">{g.classification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="name">区分別 人数集計</div>
        </div>
        <div className="metrics" style={{ marginBottom: 0 }}>
          {(['518', '379', '342', '650', '320', '290'] as const).map((k) => (
            <div className="metric" key={k}>
              <div className="l">{k}</div>
              <div className="v">
                {buckets[k]}
                <span className="u">人</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
