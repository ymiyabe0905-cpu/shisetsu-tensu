import { ymToLabel } from '../utils';

interface Props {
  value: string; // 'YYYY-MM'
  onChange: (ym: string) => void;
}

export function MonthPicker({ value, onChange }: Props) {
  return (
    <div className="month-picker">
      <label>算定対象月</label>
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value || value)}
        aria-label={ymToLabel(value)}
      />
    </div>
  );
}
