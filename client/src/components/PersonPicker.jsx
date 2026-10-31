import { useState, useRef, useEffect } from 'react';
import { User, Search, Check, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { getFieldControlClass } from '../features/extraction/useFieldHighlights';

/**
 * Searchable Person Picker for Assignee and Reviewer
 */
export default function PersonPicker({
  id,
  label,
  required = false,
  people = [],
  selectedId = '',
  onChange,
  ambiguousCandidates = [],
  ambiguityMessage = '',
  error = '',
  placeholder = 'Select a team member...',
  isHighlighted = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selectedPerson = people.find((p) => p.id === selectedId);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPeople = people.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      p.department.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q)
    );
  });

  const isAmbiguous = ambiguousCandidates.length > 0 && !selectedId;

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {isHighlighted && !error && !isAmbiguous && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
              Updated from voice
            </span>
          )}
        </div>
      </div>

      {/* Ambiguity Callout */}
      {isAmbiguous && (
        <div className="mb-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800">
              {ambiguityMessage || 'Multiple people match your speech. Please choose:'}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {ambiguousCandidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1 bg-white border border-amber-300 hover:border-amber-500 hover:bg-amber-100/60 rounded text-xs font-medium text-slate-800 shadow-xs transition"
                >
                  {c.name} ({c.role} • {c.department})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Selector Button */}
      <div
        id={id}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={Boolean(error || isAmbiguous)}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-left shadow-2xs cursor-pointer focus:outline-hidden focus:ring-2 ${getFieldControlClass({
          isHighlighted,
          error: Boolean(error),
          isAmbiguous
        })}`}
      >
        {selectedPerson ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0">
              {selectedPerson.avatar || selectedPerson.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 truncate">
              <div className="font-medium text-slate-900 leading-tight truncate">{selectedPerson.name}</div>
              <div className="text-xs text-slate-500 leading-tight truncate">
                {selectedPerson.role} • {selectedPerson.department}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <User className="w-4 h-4 text-slate-400" />
            <span className="truncate">{placeholder}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {selectedPerson && (
            <button
              type="button"
              aria-label="Clear person"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in">
          {/* Search bar inside dropdown */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              placeholder="Search by name, role, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden"
              onClick={(e) => e.stopPropagation()}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Directory list */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {/* Optional None / Leave Blank option */}
            {!required && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-100 transition ${
                  !selectedId ? 'bg-slate-50 text-slate-800 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs italic">— None (Leave blank) —</span>
                </div>
                {!selectedId && <Check className="w-4 h-4 text-slate-600 shrink-0" />}
              </button>
            )}

            {filteredPeople.length > 0 ? (
              filteredPeople.map((person) => {
                const isSelected = person.id === selectedId;
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      // Clicking an already selected optional person toggles it off to blank
                      if (!required && isSelected) {
                        onChange('');
                      } else {
                        onChange(person.id);
                      }
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50/60 transition ${
                      isSelected ? 'bg-blue-50 text-blue-900' : 'text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                        {person.avatar || person.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 leading-tight">{person.name}</div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {person.role} • {person.department}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">No team members match "{search}"</div>
            )}
          </div>
        </div>
      )}

      {/* Validation Error Message */}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
