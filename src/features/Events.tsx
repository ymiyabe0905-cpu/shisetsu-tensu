import { useState } from 'react';
import { EventKind, Patient, PatientEvent } from '../domain/types';
import { useStore, makeId } from '../state/store';
import { Modal } from '../components/Modal';
import { todayIso } from '../utils';

const EVENT_KINDS: EventKind[] = [
  '入院',
  '退院',
  '施設入所',
  '施設退所',
  '死亡',
  '訪問開始',
  '訪問終了',
  '一時停止',
  '再開',
  '棟ユニット移動',
  '施設移動',
];

export function Events() {
  const { data, dispatch } = useStore();
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const patient = data.patients.find((p) => p.id === selectedPatientId);
  const events = data.events
    .filter((e) => e.patientId === selectedPatientId)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div className="page-header">
        <h2>入退院・移動記録</h2>
      </div>

      <div className="card">
        <div className="form-grid">
          <div className="field full">
            <label>患者を選択</label>
            <select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)}>
              <option value="">—</option>
              {data.patients
                .filter((p) => !p.hidden)
                .map((p) => {
                  const fac = data.facilities.find((f) => f.id === p.facilityId);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}（{fac?.name ?? '—'}）
                    </option>
                  );
                })}
            </select>
          </div>
        </div>
      </div>

      {patient && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="name">{patient.name}</div>
              <div className="meta">
                {patient.kana ?? '—'} ・ 状態: {patient.status} ・ 保険: {patient.insurance}
              </div>
            </div>
            <button className="btn primary" onClick={() => setAdding(true)}>
              ＋ イベント追加
            </button>
          </div>

          {events.length === 0 ? (
            <div className="muted" style={{ padding: 12, textAlign: 'center' }}>
              履歴なし
            </div>
          ) : (
            <div className="timeline">
              {events.map((e) => (
                <EventTimelineItem
                  key={e.id}
                  event={e}
                  onDelete={() => {
                    if (confirm('このイベントを削除しますか？')) {
                      dispatch({ type: 'DELETE_EVENT', id: e.id });
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {adding && patient && (
        <EventForm patient={patient} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function EventTimelineItem({
  event,
  onDelete,
}: {
  event: PatientEvent;
  onDelete: () => void;
}) {
  const { data } = useStore();
  const cls =
    event.kind === '棟ユニット移動' || event.kind === '施設移動'
      ? 'move'
      : event.kind === '訪問開始'
        ? 'start'
        : event.kind === '訪問終了' || event.kind === '死亡'
          ? 'end'
          : '';

  let detail = '';
  if (event.kind === '棟ユニット移動' || event.kind === '施設移動') {
    const fromFac = data.facilities.find((f) => f.id === event.fromFacilityId);
    const toFac = data.facilities.find((f) => f.id === event.toFacilityId);
    const fromUnit = fromFac?.units.find((u) => u.id === event.fromUnitId);
    const toUnit = toFac?.units.find((u) => u.id === event.toUnitId);
    const from = `${fromFac?.name ?? '—'}${fromUnit ? ' ' + fromUnit.name : ''}`;
    const to = `${toFac?.name ?? '—'}${toUnit ? ' ' + toUnit.name : ''}`;
    detail = `${from} → ${to}`;
  }

  return (
    <div className={`timeline-item ${cls}`}>
      <div className="date">{event.date}</div>
      <div className="label">
        {event.kind}
        {detail && `: ${detail}`}
      </div>
      {event.memo && <div className="desc">{event.memo}</div>}
      <button
        className="btn small danger"
        style={{ marginTop: 4 }}
        onClick={onDelete}
      >
        削除
      </button>
    </div>
  );
}

function EventForm({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { data, dispatch } = useStore();
  const [kind, setKind] = useState<EventKind>('入院');
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [toFacilityId, setToFacilityId] = useState(patient.facilityId);
  const [toUnitId, setToUnitId] = useState<string>(patient.unitId ?? '');

  const showMove = kind === '棟ユニット移動' || kind === '施設移動';
  const toFac = data.facilities.find((f) => f.id === toFacilityId);

  function save() {
    if (showMove) {
      if (kind === '棟ユニット移動' && toUnitId === patient.unitId && toFacilityId === patient.facilityId) {
        alert('現在の所在と同じです。別の棟・ユニットを選んでください。');
        return;
      }
      if (kind === '施設移動' && toFacilityId === patient.facilityId) {
        alert('現在と同じ施設です。別の施設を選んでください。');
        return;
      }
    }
    const ev: PatientEvent = {
      id: makeId('e'),
      patientId: patient.id,
      kind,
      date,
      memo: memo || undefined,
      fromFacilityId: showMove ? patient.facilityId : undefined,
      fromUnitId: showMove ? patient.unitId : undefined,
      toFacilityId: showMove ? toFacilityId : undefined,
      toUnitId: showMove ? toUnitId || undefined : undefined,
    };
    dispatch({ type: 'UPSERT_EVENT', event: ev });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`イベント追加 — ${patient.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>イベント種別</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>日付</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {showMove && (
          <>
            <div className="field full">
              <label>移動元（自動）</label>
              <div className="computed">
                {data.facilities.find((f) => f.id === patient.facilityId)?.name ?? '—'}
                {patient.unitId && (
                  <>
                    {' '}
                    {
                      data.facilities
                        .find((f) => f.id === patient.facilityId)
                        ?.units.find((u) => u.id === patient.unitId)?.name
                    }
                  </>
                )}
              </div>
            </div>
            <div className="field">
              <label>移動先 施設</label>
              <select
                value={toFacilityId}
                onChange={(e) => {
                  setToFacilityId(e.target.value);
                  setToUnitId('');
                }}
                disabled={kind === '棟ユニット移動'}
              >
                {data.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>移動先 棟・ユニット</label>
              <select
                value={toUnitId}
                onChange={(e) => setToUnitId(e.target.value)}
                disabled={!toFac || toFac.units.length === 0}
              >
                <option value="">—</option>
                {toFac?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="field full">
          <label>メモ</label>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
