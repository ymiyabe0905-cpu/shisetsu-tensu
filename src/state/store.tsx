// アプリ全体の状態管理（Context + useReducer）
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  ReactNode,
} from 'react';
import {
  AppData,
  Facility,
  Patient,
  PatientEvent,
  Settings,
  VisitRecord,
} from '../domain/types';
import { applyGroupHomeRule } from '../domain/calc';
import { loadData, saveData } from '../storage/db';
import { makeSeed } from '../domain/seed';

type Action =
  | { type: 'INIT'; data: AppData }
  | { type: 'UPSERT_FACILITY'; facility: Facility }
  | { type: 'DELETE_FACILITY'; id: string }
  | { type: 'UPSERT_PATIENT'; patient: Patient }
  | { type: 'DELETE_PATIENT'; id: string; mode: 'hide' | 'remove' }
  | { type: 'TOGGLE_PATIENT_HIDDEN'; id: string }
  | { type: 'UPSERT_VISIT'; visit: VisitRecord }
  | { type: 'DELETE_VISIT'; patientId: string; yearMonth: string }
  | { type: 'UPSERT_EVENT'; event: PatientEvent }
  | { type: 'DELETE_EVENT'; id: string }
  | { type: 'UPDATE_SETTINGS'; settings: Settings }
  | { type: 'REPLACE_ALL'; data: AppData }
  | { type: 'RESET' };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'INIT':
      return action.data;

    case 'UPSERT_FACILITY': {
      const adjusted = applyGroupHomeRule(action.facility);
      const exists = state.facilities.some((f) => f.id === adjusted.id);
      const facilities = exists
        ? state.facilities.map((f) => (f.id === adjusted.id ? adjusted : f))
        : [...state.facilities, adjusted];
      return { ...state, facilities };
    }

    case 'DELETE_FACILITY': {
      // 所属患者がいる場合は実行不可（呼び出し側でブロック）
      return {
        ...state,
        facilities: state.facilities.filter((f) => f.id !== action.id),
      };
    }

    case 'UPSERT_PATIENT': {
      const exists = state.patients.some((p) => p.id === action.patient.id);
      const patients = exists
        ? state.patients.map((p) => (p.id === action.patient.id ? action.patient : p))
        : [...state.patients, action.patient];
      return { ...state, patients };
    }

    case 'DELETE_PATIENT': {
      if (action.mode === 'hide') {
        return {
          ...state,
          patients: state.patients.map((p) =>
            p.id === action.id ? { ...p, hidden: true } : p
          ),
        };
      }
      return {
        ...state,
        patients: state.patients.filter((p) => p.id !== action.id),
      };
    }

    case 'TOGGLE_PATIENT_HIDDEN':
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.id ? { ...p, hidden: !p.hidden } : p
        ),
      };

    case 'UPSERT_VISIT': {
      const idx = state.visits.findIndex(
        (v) => v.patientId === action.visit.patientId && v.yearMonth === action.visit.yearMonth
      );
      const visits = [...state.visits];
      if (idx >= 0) {
        visits[idx] = action.visit;
      } else {
        visits.push(action.visit);
      }
      return { ...state, visits };
    }

    case 'DELETE_VISIT':
      return {
        ...state,
        visits: state.visits.filter(
          (v) => !(v.patientId === action.patientId && v.yearMonth === action.yearMonth)
        ),
      };

    case 'UPSERT_EVENT': {
      const exists = state.events.some((e) => e.id === action.event.id);
      const events = exists
        ? state.events.map((e) => (e.id === action.event.id ? action.event : e))
        : [...state.events, action.event];

      // 状態反映: 入院/退院/死亡/訪問終了/一時停止/再開 を患者ステータスに反映
      let patients = state.patients;
      const ev = action.event;
      patients = patients.map((p) => {
        if (p.id !== ev.patientId) return p;
        switch (ev.kind) {
          case '入院':
            return { ...p, status: '入院中', admissionDate: ev.date };
          case '退院':
            return { ...p, status: '訪問対象', dischargeDate: ev.date };
          case '死亡':
            return { ...p, status: '死亡', endDate: ev.date };
          case '訪問終了':
            return { ...p, status: '終了', endDate: ev.date };
          case '一時停止':
            return { ...p, status: '一時停止' };
          case '再開':
            return { ...p, status: '訪問対象' };
          case '訪問開始':
            return { ...p, status: '訪問対象', startDate: ev.date };
          case '棟ユニット移動':
            return ev.toUnitId ? { ...p, unitId: ev.toUnitId } : p;
          case '施設移動':
            return ev.toFacilityId
              ? { ...p, facilityId: ev.toFacilityId, unitId: ev.toUnitId }
              : p;
        }
        return p;
      });

      return { ...state, events, patients };
    }

    case 'DELETE_EVENT':
      return { ...state, events: state.events.filter((e) => e.id !== action.id) };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: action.settings };

    case 'REPLACE_ALL':
      return action.data;

    case 'RESET':
      return makeSeed();
  }
}

interface Store {
  data: AppData;
  loaded: boolean;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, makeSeed());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadData()
      .then((d) => {
        dispatch({ type: 'INIT', data: d });
        setLoaded(true);
      })
      .catch((e) => {
        console.error('failed to load data', e);
        setLoaded(true);
      });
  }, []);

  // 変更があれば永続化
  useEffect(() => {
    if (!loaded) return;
    saveData(state).catch((e) => console.error('failed to save data', e));
  }, [state, loaded]);

  return (
    <StoreContext.Provider value={{ data: state, loaded, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// 一意なIDを作る
export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
