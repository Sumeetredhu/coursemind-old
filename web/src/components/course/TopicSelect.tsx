import type { TopicSummary } from "@/lib/types";
import { field } from "../ui";

type Props = {
  topics: TopicSummary[];
  value: string;
  onChange: (value: string) => void;
  anyLabel?: string;
};

export function TopicSelect({ topics, value, onChange, anyLabel }: Props) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} sm:w-72`}>
      {anyLabel && <option value="">{anyLabel}</option>}
      {!anyLabel && !value && <option value="">Pick a topic</option>}
      {topics.map((t, i) => (
        <option key={t.id} value={t.id}>
          {i + 1}. {t.title}
        </option>
      ))}
    </select>
  );
}
