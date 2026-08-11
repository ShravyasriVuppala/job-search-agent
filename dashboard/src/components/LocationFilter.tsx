interface Props {
  selected: string;
  onChange: (location: string) => void;
}

const options = [
  { value: 'all', label: 'All locations' },
  { value: 'remote', label: 'Remote' },
  { value: 'washington', label: 'Washington' },
  { value: 'other', label: 'Other' },
];

export function LocationFilter({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={selected === opt.value}
          className={`px-4 py-1.5 rounded-pill text-sm font-medium transition-colors ${
            selected === opt.value
              ? 'bg-surface dark:bg-surface-2 text-heading shadow-sm dark:shadow-none'
              : 'text-label hover:text-heading'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
