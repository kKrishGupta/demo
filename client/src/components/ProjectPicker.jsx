import { useState, useRef, useEffect } from 'react';
import { Folder, Search, Check, ChevronDown, X } from 'lucide-react';
import { getFieldControlClass } from '../features/extraction/useFieldHighlights';

/**
 * Searchable Project Picker
 */
export default function ProjectPicker({
  id,
  label,
  required = false,
  projects = [],
  selectedId = '',
  onChange,
  error = '',
  placeholder = 'Select a project...',
  isHighlighted = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  const selectedProject = projects.find((p) => p.id === selectedId);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProjects = projects.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.department && p.department.toLowerCase().includes(q))
    );
  });

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {isHighlighted && !error && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100/80 border border-blue-200 px-1.5 py-0.5 rounded animate-in fade-in">
              Updated from voice
            </span>
          )}
        </div>
      </div>

      {/* Main Selector Button */}
      <div
        id={id}
        tabIndex={0}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2 border rounded-lg text-sm text-left shadow-2xs cursor-pointer focus:outline-hidden focus:ring-2 ${getFieldControlClass({
          isHighlighted,
          error: Boolean(error)
        })}`}
      >
        {selectedProject ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold tracking-wider shrink-0">
              {selectedProject.code}
            </span>
            <div className="min-w-0 truncate">
              <span className="font-medium text-slate-900 truncate">{selectedProject.name}</span>
              <span className="text-xs text-slate-500 ml-1.5 hidden sm:inline">({selectedProject.department})</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <Folder className="w-4 h-4 text-slate-400" />
            <span className="truncate">{placeholder}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {selectedProject && (
            <button
              type="button"
              aria-label="Clear project"
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

      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in">
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              placeholder="Search by project name or code..."
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

          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
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
                  <span className="text-xs italic">— None (No project) —</span>
                </div>
                {!selectedId && <Check className="w-4 h-4 text-slate-600 shrink-0" />}
              </button>
            )}

            {filteredProjects.length > 0 ? (
              filteredProjects.map((project) => {
                const isSelected = project.id === selectedId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      if (!required && isSelected) {
                        onChange('');
                      } else {
                        onChange(project.id);
                      }
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50/60 transition ${
                      isSelected ? 'bg-blue-50 text-blue-900' : 'text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold shrink-0">
                        {project.code}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 leading-tight">{project.name}</div>
                        <div className="text-[11px] text-slate-500 leading-tight">
                          {project.description} • {project.department}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">No projects match "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
