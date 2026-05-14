interface Props {
  selected: string;
  onChange: (location: string) => void;
}

const options = [
  { value: 'all', label: 'All Locations' },
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
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selected === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
