'use client';

const EXAM_SYSTEMS: { label: string; text: string }[] = [
  { label: 'General', text: 'General: Patient appears well, NAD. AVSS.' },
  { label: 'HEENT', text: 'HEENT: PERRL, EOMI, TMs clear bilaterally, oropharynx clear, no lymphadenopathy.' },
  { label: 'Resp', text: 'Resp: Clear to auscultation bilaterally, no wheezes/crackles, normal work of breathing.' },
  { label: 'CVS', text: 'CVS: S1S2, regular rate and rhythm, no murmurs, peripheral pulses intact.' },
  { label: 'Abdo', text: 'Abdo: Soft, non-tender, non-distended, no guarding/rigidity, BS+.' },
  { label: 'MSK', text: 'MSK: No deformity, full ROM, no tenderness, neurovascularly intact distally.' },
  { label: 'Neuro', text: 'Neuro: Alert and oriented, CN II-XII intact, normal motor/sensory, normal gait.' },
  { label: 'Skin', text: 'Skin: No rashes, warm and well-perfused, no lesions.' },
  { label: 'Psych', text: 'Psych: Calm, cooperative, normal affect, no SI/HI.' },
];

interface ExamTogglesProps {
  value: string;
  onChange: (value: string) => void;
}

export function ExamToggles({ value, onChange }: ExamTogglesProps) {
  const isActive = (system: { text: string }) => {
    return value.includes(system.text);
  };

  const toggle = (system: { text: string }) => {
    if (isActive(system)) {
      // Remove - strip the text and any surrounding newlines
      const newValue = value
        .replace(system.text, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      onChange(newValue);
    } else {
      // Append
      const separator = value.trim() ? '\n' : '';
      onChange(value.trim() + separator + system.text);
    }
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      {EXAM_SYSTEMS.map((system) => (
        <button
          key={system.label}
          type="button"
          onClick={() => toggle(system)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            isActive(system)
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {system.label}
        </button>
      ))}
    </div>
  );
}
