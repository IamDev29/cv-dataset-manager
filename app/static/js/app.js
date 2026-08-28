/**
 * Boxel - CV Dataset Manager
 * Main Application (replaces App.tsx)
 * Vanilla JS single-page application
 */

// ─── Constants ───────────────────────────────────────────────────────────────
const CLASS_COLORS = [
  '#FF4D4D', '#3DA9FC', '#00E5A3', '#FFB020', '#D846FF',
  '#FF5E97', '#00F5FF', '#FF7A00', '#9DFF00', '#9E66FF',
  '#10B981', '#FF9F1C'
];

// ─── Application State ────────────────────────────────────────────────────────
const state = {
  projects: [],
  activeProjectId: null,
  images: [],
  imagesLoading: false,
  importProgress: null,
  skippedFiles: [],
  dragActive: false,
  pipelineTab: 'split', // 'split' | 'augment' | 'export'
  importMode: 'images',  // 'images' | 'video'
  splitFilter: 'all',
  annotationFilter: 'all',
  searchQuery: '',
  sortBy: 'created-desc',
  settings: {
    train_percent: 70, val_percent: 20, test_percent: 10,
    include_unannotated: false,
    aug_flip: true, aug_rotation: true, aug_brightness: true,
    aug_exposure: true, aug_noise: false, aug_variants_count: 2
  },
  // Status messages
  autoSplitStatus: null,
  augStatus: null,
  exportStatus: null,
  extractionStatus: null,
  extractionProgress: null,
  isExtracting: false,
  // Video
  selectedVideo: null,
  videoUrl: null,
  videoMetadata: null,
  extractionMode: 'interval',
  extractionInterval: 2.0,
  extractionFps: 1,
  // Class form
  newClassName: '',
  classError: null,
  // Video drag
  videoDragActive: false,
  // AI model assist
  projectModel: null,          // { id, projectId, filename, classNames, numClasses, classMapping, confidenceThreshold, inputShape }
  modelDragActive: false,
  inferenceRunning: false,
  inferenceProgress: null,     // { current, total, done }
  inferenceStatus: null,       // { type, message }
  aiConfidenceThreshold: 0.5,
  pendingClassNames: [],       // manual class name entry list
  pendingMappingEdits: {},     // { modelClassIdx: 'cls-xxx' | 'NEW' }
  showMappingForm: false,
};

// ─── Toast Notifications ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-900/90 border-emerald-700/50 text-emerald-300',
    error: 'bg-red-950/90 border-red-800/50 text-red-300',
    info: 'bg-[#1C2128]/95 border-[#2A2F38] text-[#E6E9EF]',
    loading: 'bg-[#1C2128]/95 border-[#3DA9FC]/30 text-[#3DA9FC]'
  };
  toast.className = `animate-toast pointer-events-auto px-4 py-3 rounded-xl border text-xs font-medium shadow-xl max-w-sm ${colors[type] || colors.info}`;
  toast.textContent = message;
  container.appendChild(toast);
  if (type !== 'loading') {
    setTimeout(() => toast.remove(), 4000);
  }
  return toast;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSplitStats() {
  return {
    train: state.images.filter(i => i.split === 'train').length,
    val: state.images.filter(i => i.split === 'val').length,
    test: state.images.filter(i => i.split === 'test').length,
    unassigned: state.images.filter(i => !i.split || i.split === 'unassigned').length,
    total: state.images.length
  };
}

function getFilteredImages() {
  return state.images.filter(img => {
    const matchesSplit = state.splitFilter === 'all' ||
      (state.splitFilter === 'unassigned'
        ? (!img.split || img.split === 'unassigned')
        : img.split === state.splitFilter);
    const hasBoxes = img.annotations && img.annotations.length > 0;
    const matchesAnnotation = state.annotationFilter === 'all' ||
      (state.annotationFilter === 'annotated' ? hasBoxes : !hasBoxes);
    return matchesSplit && matchesAnnotation;
  });
}

function getActiveProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

// ─── Main Render ──────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = renderLayout();
  attachEventListeners();
}

function renderLayout() {
  return `
    <div class="min-h-screen flex flex-col bg-[#0F1116]">
      ${renderHeader()}
      <main class="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
        ${state.activeProjectId ? renderWorkspace() : renderHome()}
      </main>
      ${renderFooter()}
      ${renderModals()}
    </div>
  `;
}

// ─── Header ───────────────────────────────────────────────────────────────────
function renderHeader() {
  return `
    <header class="sticky top-0 z-50 bg-[#161B22]/95 backdrop-blur-md border-b border-[#21262D] px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        ${renderLogo()}
        <div>
          <h1 class="font-bold text-lg leading-none flex items-center gap-0.5" style="font-family:var(--font-sans)">
            boxel<span class="text-[#3DA9FC] font-extrabold">.</span>
          </h1>
          <p class="text-[9px] text-[#8B93A1] tracking-widest uppercase mt-0.5" style="font-family:var(--font-mono)">
            Offline CV Studio
          </p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F1116] border border-[#21262D] text-[#8B93A1]" style="font-family:var(--font-mono);font-size:11px">
          <span class="w-2 h-2 rounded-full bg-[#FFB020] animate-pulse-dot"></span>
          <span>Local Sync Active</span>
        </div>
      </div>
    </header>
  `;
}

function renderLogo() {
  return `
    <div id="boxel-logo-icon" class="relative w-10 h-10 rounded-xl flex items-center justify-center border overflow-hidden cursor-pointer"
         style="background: linear-gradient(135deg, #1E1B4B, #311042); border-color: rgba(67,56,202,0.4); box-shadow: 0 0 15px rgba(99,102,241,0.15)">
      <div class="absolute inset-0 rounded-full blur-md opacity-25" style="background: linear-gradient(to right, #10B981, #6366F1)"></div>
      <svg class="w-6 h-6 relative z-10" viewBox="0 0 24 24" fill="none">
        <rect x="7.5" y="7.5" width="9" height="9" rx="1" fill="rgba(67,56,202,0.15)" stroke="#818CF8" stroke-width="1.5" stroke-dasharray="2 2"/>
        <path d="M4 8V4H8" stroke="#34D399" stroke-width="2" stroke-linecap="round"/>
        <path d="M20 8V4H16" stroke="#34D399" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 16V20H8" stroke="#34D399" stroke-width="2" stroke-linecap="round"/>
        <path d="M20 16V20H16" stroke="#34D399" stroke-width="2" stroke-linecap="round"/>
        <circle cx="4" cy="4" r="1.5" fill="#E2E8F0"/>
        <circle cx="20" cy="4" r="1.5" fill="#E2E8F0"/>
        <circle cx="4" cy="20" r="1.5" fill="#E2E8F0"/>
        <circle cx="20" cy="20" r="1.5" fill="#E2E8F0"/>
        <circle cx="12" cy="12" r="1" fill="#A5B4FC" opacity="0.6"/>
      </svg>
    </div>
  `;
}

function renderFooter() {
  const totalImages = state.projects.reduce((acc, p) => acc + p.imageCount, 0);
  return `
    <footer class="border-t border-[#21262D] bg-[#0C0F13] py-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-2"
            style="font-family:var(--font-mono);font-size:10px;color:#4B5563">
      <div class="flex items-center gap-1.5">
        <span style="font-family:var(--font-sans);font-weight:700;color:#6B7280">boxel.</span>
        <span>&copy; 2026. Python/FastAPI Edition.</span>
      </div>
      <div class="flex items-center gap-3">
        <span>Est. Storage: ~${(totalImages * 120).toFixed(0)} KB</span>
        <span>&middot;</span>
        <span>v2.0.0-py</span>
      </div>
    </footer>
  `;
}

// ─── Home View ────────────────────────────────────────────────────────────────
function renderHome() {
  const total = state.projects.length;
  const totalImages = state.projects.reduce((acc, p) => acc + p.imageCount, 0);

  let filtered = state.projects.filter(p =>
    p.name.toLowerCase().includes(state.searchQuery.toLowerCase())
  );
  if (state.sortBy === 'created-desc') filtered.sort((a, b) => b.createdAt - a.createdAt);
  else if (state.sortBy === 'created-asc') filtered.sort((a, b) => a.createdAt - b.createdAt);
  else if (state.sortBy === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sortBy === 'images-desc') filtered.sort((a, b) => b.imageCount - a.imageCount);

  return `
    <div class="animate-fade-in space-y-8" id="home-view">
      <!-- Metrics -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${renderMetricCard('Total Projects', total, `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        `)}
        ${renderMetricCard('Total Images', totalImages, `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        `, null, `files`)}
        ${renderMetricCard('Storage Mode', null, `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        `, `<div class="flex items-center gap-1.5 mt-2.5"><span class="w-2 h-2 rounded-full bg-[#FFB020]"></span><span class="text-sm font-semibold text-[#E6E9EF]">SQLite (Server)</span></div>`)}
      </div>

      <!-- Controls -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161B22] border border-[#21262D] p-4 rounded-2xl">
        <div class="relative flex-grow max-w-md">
          <svg class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B93A1]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" id="search-input" placeholder="Filter projects..."
            value="${escHtml(state.searchQuery)}"
            class="w-full pl-10 pr-4 py-2 border border-[#21262D] rounded-xl text-sm bg-[#0F1116] text-[#E6E9EF] outline-none focus:ring-2 focus:ring-[#3DA9FC]/50 transition-all"
            style="font-family:var(--font-sans)">
          ${state.searchQuery ? `<button id="clear-search" class="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B93A1] hover:text-white transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>` : ''}
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 border border-[#21262D] rounded-xl px-3 py-2 bg-[#0F1116] text-xs text-[#E6E9EF]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="2"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
            <select id="sort-select" class="bg-transparent outline-none text-[#E6E9EF] font-medium cursor-pointer" style="font-family:var(--font-sans)">
              <option value="created-desc" ${state.sortBy === 'created-desc' ? 'selected' : ''}>Newest First</option>
              <option value="created-asc" ${state.sortBy === 'created-asc' ? 'selected' : ''}>Oldest First</option>
              <option value="name-asc" ${state.sortBy === 'name-asc' ? 'selected' : ''}>Alphabetical</option>
              <option value="images-desc" ${state.sortBy === 'images-desc' ? 'selected' : ''}>Most Images</option>
            </select>
          </div>
          <button id="new-project-btn"
            class="flex items-center gap-2 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#0F1116] text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer"
            style="box-shadow:0 4px 15px rgba(61,169,252,0.2)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            New Project
          </button>
        </div>
      </div>

      <!-- Projects Grid -->
      ${filtered.length > 0 ? `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="projects-grid">
          ${filtered.map(renderProjectCard).join('')}
        </div>
      ` : `
        <div class="text-center py-20 bg-[#161B22] border border-dashed border-[#21262D] rounded-2xl">
          <div class="w-14 h-14 rounded-full bg-[#0F1116] border border-[#21262D] flex items-center justify-center mx-auto mb-4 text-[#4B5563]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <h3 class="font-semibold text-base text-[#E6E9EF] mb-1">No projects found</h3>
          <p class="text-sm text-[#8B93A1] max-w-xs mx-auto">
            ${state.searchQuery ? 'No projects match your filter.' : 'Create your first CV project to get started.'}
          </p>
          ${!state.searchQuery ? `
            <button id="create-first-project-btn"
              class="mt-5 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors cursor-pointer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create Project
            </button>
          ` : ''}
        </div>
      `}
    </div>
  `;
}

function renderMetricCard(label, value, icon, customContent, suffix = '') {
  return `
    <div class="group relative bg-[#161B22] border border-[#21262D] p-5 rounded-2xl flex items-center justify-between hover:border-[#2A2F38] transition-all"
         style="box-shadow:0 4px 20px rgba(0,0,0,0.3)">
      ${renderCornerBrackets('blue')}
      <div>
        <p class="text-[10px] text-[#8B93A1] tracking-wider uppercase mb-1" style="font-family:var(--font-mono)">${label}</p>
        ${customContent || `
          <p class="text-3xl font-bold tracking-tight text-[#E6E9EF]" style="font-family:var(--font-mono)">
            ${value}${suffix ? `<span class="text-xs text-[#8B93A1] ml-1 font-normal">${suffix}</span>` : ''}
          </p>
        `}
      </div>
      <div class="w-10 h-10 rounded-xl bg-[#0F1116] border border-[#21262D] flex items-center justify-center z-10">
        ${icon}
      </div>
    </div>
  `;
}

function renderCornerBrackets(color = 'blue') {
  const c = color === 'blue' ? '#3DA9FC' : color === 'amber' ? '#FFB020' : '#2A2F38';
  return `
    <div class="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
      <div class="absolute top-0 left-0 border-t-2 border-l-2 rounded-tl-sm" style="width:8px;height:8px;border-color:${c}"></div>
      <div class="absolute top-0 right-0 border-t-2 border-r-2 rounded-tr-sm" style="width:8px;height:8px;border-color:${c}"></div>
      <div class="absolute bottom-0 left-0 border-b-2 border-l-2 rounded-bl-sm" style="width:8px;height:8px;border-color:${c}"></div>
      <div class="absolute bottom-0 right-0 border-b-2 border-r-2 rounded-br-sm" style="width:8px;height:8px;border-color:${c}"></div>
    </div>
  `;
}

function renderProjectCard(project) {
  return `
    <div class="group relative bg-[#161B22] border border-[#21262D] rounded-2xl hover:border-[#3DA9FC]/40 hover:shadow-xl transition-all duration-200 flex flex-col overflow-hidden cursor-pointer"
         id="project-card-${project.id}"
         data-project-id="${project.id}">
      ${renderCornerBrackets('blue')}
      <!-- Top visual area -->
      <div class="h-24 bg-[#0F1116]/80 border-b border-[#21262D]/60 p-4 flex items-end justify-between relative overflow-hidden">
        <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-all duration-300">
          <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        </div>
        <div class="flex items-center gap-2 bg-[#161B22]/95 px-2.5 py-1 rounded-lg border border-[#21262D]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <span class="text-xs font-semibold text-[#E6E9EF]" style="font-family:var(--font-mono)">${project.imageCount} images</span>
        </div>
        <span class="text-[9px] text-[#8B93A1] tracking-wider uppercase bg-[#0F1116] px-2 py-0.5 rounded border border-[#21262D]" style="font-family:var(--font-mono)">
          ID: ${project.id.slice(0, 10)}
        </span>
      </div>
      <!-- Content -->
      <div class="p-5 flex-grow flex flex-col gap-4">
        <div>
          <h3 class="font-semibold text-lg text-[#E6E9EF] group-hover:text-[#3DA9FC] transition-colors truncate">${escHtml(project.name)}</h3>
          <div class="flex items-center gap-1.5 mt-1.5 text-[#8B93A1]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span class="text-xs">Created ${formatDate(project.createdAt)}</span>
          </div>
          ${project.classes && project.classes.length > 0 ? `
            <div class="flex items-center gap-1 mt-2 flex-wrap">
              ${project.classes.slice(0, 5).map(c => `
                <span class="w-2.5 h-2.5 rounded-full" style="background:${c.color}" title="${escHtml(c.name)}"></span>
              `).join('')}
              ${project.classes.length > 5 ? `<span class="text-[9px] text-[#8B93A1]">+${project.classes.length - 5}</span>` : ''}
            </div>
          ` : ''}
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-[#21262D]/80">
          <span class="text-xs text-[#8B93A1] group-hover:text-[#E6E9EF] transition-colors flex items-center gap-1 font-medium">
            Open Workspace <span>&rarr;</span>
          </span>
          <button class="delete-project-btn p-1.5 rounded-lg hover:bg-red-950/30 text-[#8B93A1] hover:text-red-400 transition-colors border border-transparent hover:border-red-900/30"
                  data-project-id="${project.id}" data-project-name="${escHtml(project.name)}"
                  id="delete-btn-${project.id}" title="Delete Project">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Workspace View ───────────────────────────────────────────────────────────
function renderWorkspace() {
  const project = getActiveProject();
  if (!project) return '';
  const splitStats = getSplitStats();
  const annotatedCount = state.images.filter(i => i.annotations && i.annotations.length > 0).length;
  const unlabeledCount = state.images.length - annotatedCount;

  return `
    <div class="animate-fade-in space-y-6" id="workspace-view">
      <!-- Breadcrumb + Back -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#21262D]">
        <div class="flex items-center gap-3">
          <button id="back-to-projects-btn"
            class="p-2 rounded-xl border border-[#21262D] bg-[#161B22] hover:bg-[#0F1116] text-[#8B93A1] hover:text-[#3DA9FC] transition-all cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] uppercase tracking-wider text-[#8B93A1]" style="font-family:var(--font-mono)">Workspace</span>
              <span class="text-[#21262D]">/</span>
              <span class="text-[10px] uppercase tracking-wider text-[#8B93A1]" style="font-family:var(--font-mono)">${project.id.slice(0, 10)}</span>
            </div>
            <h2 class="text-2xl font-bold tracking-tight text-[#E6E9EF] mt-0.5">${escHtml(project.name)}</h2>
          </div>
        </div>
        <div class="flex items-center gap-2 text-xs font-mono text-[#8B93A1] bg-[#161B22] border border-[#21262D] px-3 py-1.5 rounded-xl self-start sm:self-auto">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          ${project.imageCount} Total Images
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#161B22] border border-[#21262D] p-4 rounded-2xl" id="workspace-stats-dashboard">
        <div class="p-3.5 rounded-xl bg-[#0F1116] border border-[#21262D]/60" id="stat-total-images">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-[#8B93A1] uppercase tracking-wider font-semibold" style="font-family:var(--font-mono)">Total Images</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          </div>
          <span class="text-xl font-bold font-mono text-[#E6E9EF]">${state.images.length}</span>
          <span class="text-[10px] text-[#8B93A1] ml-1">files</span>
        </div>
        <div class="p-3.5 rounded-xl bg-[#0F1116] border border-[#21262D]/60" id="stat-annotation-status">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-[#8B93A1] uppercase tracking-wider font-semibold" style="font-family:var(--font-mono)">Labels</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFB020" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
          <div class="flex justify-between items-end">
            <div>
              <div class="text-xs font-semibold text-[#E6E9EF]">${annotatedCount} <span class="text-[10px] text-[#8B93A1] font-normal">labeled</span></div>
              <div class="text-[10px] text-[#8B93A1] mt-0.5">${unlabeledCount} unlabeled</div>
            </div>
            <span class="font-mono text-xs font-bold text-[#FFB020]">${state.images.length > 0 ? Math.round((annotatedCount / state.images.length) * 100) : 0}%</span>
          </div>
        </div>
        <!-- Split bar (spans 2 cols) -->
        <div class="p-3.5 rounded-xl bg-[#0F1116] border border-[#21262D]/60 col-span-2" id="stat-splits-distribution">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] text-[#8B93A1] uppercase tracking-wider font-semibold" style="font-family:var(--font-mono)">Split Distribution</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3DA9FC" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          </div>
          <div class="w-full h-2 rounded-full overflow-hidden flex bg-[#161B22] border border-[#21262D] mb-2">
            ${state.images.length > 0 ? `
              <div class="h-full bg-[#3DA9FC]" style="width:${(splitStats.train / state.images.length * 100).toFixed(1)}%;transition:width .3s"></div>
              <div class="h-full bg-[#FFB020]" style="width:${(splitStats.val / state.images.length * 100).toFixed(1)}%;transition:width .3s"></div>
              <div class="h-full bg-[#8B93A1]" style="width:${(splitStats.test / state.images.length * 100).toFixed(1)}%;transition:width .3s"></div>
              <div class="h-full bg-[#21262D]" style="width:${(splitStats.unassigned / state.images.length * 100).toFixed(1)}%;transition:width .3s"></div>
            ` : '<div class="bg-[#21262D] w-full h-full"></div>'}
          </div>
          <div class="flex items-center justify-between text-[9px] font-mono text-[#8B93A1]">
            <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#3DA9FC]"></span>Train: <span class="text-[#E6E9EF] font-bold">${splitStats.train}</span></div>
            <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#FFB020]"></span>Val: <span class="text-[#E6E9EF] font-bold">${splitStats.val}</span></div>
            <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#8B93A1]"></span>Test: <span class="text-[#E6E9EF] font-bold">${splitStats.test}</span></div>
            <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#21262D] border border-[#4B5563]"></span>None: <span class="font-bold">${splitStats.unassigned}</span></div>
          </div>
        </div>
      </div>

      <!-- Main workspace grid -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <!-- Sidebar -->
        <div class="lg:col-span-1 space-y-4">
          ${renderSetupPanel(project)}
          ${renderPipelinePanel(project, splitStats)}
          ${renderAIAssistPanel(project)}
          ${renderWorkspaceTip()}
        </div>
        <!-- Image gallery -->
        <div class="lg:col-span-3 space-y-4">
          ${renderImageGallery()}
        </div>
      </div>
    </div>
  `;
}

function renderSetupPanel(project) {
  const classes = project.classes || [];
  return `
    <div class="group bg-[#161B22] border border-[#21262D] rounded-2xl overflow-hidden" id="workspace-setup-panel">
      ${renderCornerBrackets('blue')}
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#21262D]/60 pb-3">
          <h3 class="font-bold text-xs text-[#E6E9EF] tracking-wider uppercase" style="font-family:var(--font-sans)">1. Workspace Setup</h3>
          <span class="font-mono text-[10px] text-[#3DA9FC] bg-[#0F1116] border border-[#21262D]/80 px-2 py-0.5 rounded">${classes.length} Classes</span>
        </div>

        <!-- Add class form -->
        <form id="add-class-form" class="space-y-2">
          <div class="flex gap-2">
            <input type="text" id="class-name-input" placeholder="Class name (e.g. car)..."
              value="${escHtml(state.newClassName)}"
              class="flex-grow min-w-0 px-2.5 py-1.5 border border-[#21262D] rounded-lg text-xs bg-[#0F1116] text-[#E6E9EF] outline-none focus:ring-2 focus:ring-[#3DA9FC]/50 transition-all"
              required>
            <button type="submit"
              class="px-3 py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#0F1116] rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          ${state.classError ? `<p class="text-[10px] text-red-400">${escHtml(state.classError)}</p>` : ''}
        </form>

        <!-- Classes list -->
        ${classes.length > 0 ? `
          <div class="space-y-1.5 max-h-32 overflow-y-auto pr-1">
            ${classes.map(cls => `
              <div class="flex items-center justify-between p-2 rounded-lg bg-[#0F1116]/40 border border-[#21262D]/50 text-xs hover:border-[#21262D]/80 group/class transition-all">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${cls.color}"></span>
                  <span class="font-medium text-[#E6E9EF] truncate">${escHtml(cls.name)}</span>
                </div>
                <button class="delete-class-btn text-[#8B93A1] hover:text-red-400 p-1 rounded opacity-0 group-hover/class:opacity-100 transition-opacity cursor-pointer"
                        data-class-id="${cls.id}">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="text-center py-3 px-2 bg-[#0F1116]/20 border border-dashed border-[#21262D]/60 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="1.5" class="mx-auto mb-1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            <p class="text-[10px] text-[#8B93A1]">No classes defined yet.</p>
          </div>
        `}

        <!-- Import section -->
        <div class="border-t border-[#21262D]/60 pt-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-[10px] uppercase font-mono tracking-wider text-[#8B93A1]">Data Import</span>
          </div>
          <!-- Mode tabs -->
          <div class="flex bg-[#0F1116]/60 border border-[#21262D]/50 rounded-lg p-1 text-xs">
            <button type="button" id="import-mode-images"
              class="flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${state.importMode === 'images' ? 'bg-[#161B22] text-[#3DA9FC] border border-[#21262D]/50' : 'text-[#8B93A1] hover:text-[#E6E9EF]'}">
              Images
            </button>
            <button type="button" id="import-mode-video"
              class="flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${state.importMode === 'video' ? 'bg-[#161B22] text-[#3DA9FC] border border-[#21262D]/50' : 'text-[#8B93A1] hover:text-[#E6E9EF]'}">
              Video Frames
            </button>
          </div>
          ${state.importMode === 'images' ? renderImageDropzone() : renderVideoImport()}
        </div>

        <!-- Project metadata -->
        <div class="border-t border-[#21262D]/60 pt-4 space-y-2 text-xs">
          <div class="flex justify-between text-[11px]">
            <span class="text-[#8B93A1]">Created:</span>
            <span class="text-[#E6E9EF]" style="font-family:var(--font-mono)">${formatDate(project.createdAt)}</span>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#8B93A1]">Type:</span>
            <span class="text-[#E6E9EF]">Object Detection</span>
          </div>
          <div class="flex justify-between text-[11px]">
            <span class="text-[#8B93A1]">Storage:</span>
            <span class="text-[#E6E9EF]">SQLite (Server)</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderImageDropzone() {
  return `
    <div id="image-dropzone"
      class="relative border border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${state.dragActive ? 'border-[#3DA9FC] bg-[#3DA9FC]/5' : 'border-[#21262D] bg-[#0F1116]/35 hover:border-[#2A2F38]'}"
      ondragenter="handleDrag(event)" ondragover="handleDrag(event)" ondragleave="handleDrag(event)" ondrop="handleDrop(event)">
      <input type="file" id="image-file-input" multiple accept="image/*" class="hidden">
      <div class="flex flex-col items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="2" class="${state.dragActive ? 'animate-bounce' : ''}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p class="text-[10px] text-[#8B93A1]">Drag files here or</p>
        <label for="image-file-input" class="px-2.5 py-1 bg-[#0F1116] hover:bg-[#161B22] border border-[#21262D] text-[#E6E9EF] text-[10px] font-semibold rounded-lg cursor-pointer transition-all">
          Select Files
        </label>
      </div>
      ${state.importProgress ? `
        <div class="absolute inset-0 bg-[#161B22]/95 rounded-xl flex flex-col items-center justify-center gap-2 z-10">
          <svg class="animate-spin text-[#3DA9FC]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p class="text-[9px] font-semibold text-[#E6E9EF]">Importing...</p>
          <p class="text-[8px] text-[#8B93A1]" style="font-family:var(--font-mono)">${state.importProgress.current}/${state.importProgress.total}</p>
        </div>
      ` : ''}
    </div>
    ${state.skippedFiles.length > 0 ? `
      <div class="text-[9px] text-amber-400 bg-amber-950/10 border border-amber-900/20 rounded-lg p-2">
        Skipped ${state.skippedFiles.length} non-image file(s).
        <button id="clear-skipped" class="underline ml-1 cursor-pointer">Dismiss</button>
      </div>
    ` : ''}
  `;
}

function renderVideoImport() {
  if (!state.selectedVideo) {
    return `
      <div id="video-dropzone"
        class="relative border border-dashed rounded-xl p-4 text-center transition-all ${state.videoDragActive ? 'border-[#3DA9FC] bg-[#3DA9FC]/5' : 'border-[#21262D] bg-[#0F1116]/35 hover:border-[#2A2F38]'}"
        ondragenter="handleVideoDrag(event)" ondragover="handleVideoDrag(event)" ondragleave="handleVideoDrag(event)" ondrop="handleVideoDrop(event)">
        <input type="file" id="video-file-input" accept="video/*" class="hidden">
        <div class="flex flex-col items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p class="text-[10px] text-[#8B93A1]">Drag video here or</p>
          <label for="video-file-input" class="px-2.5 py-1 bg-[#0F1116] hover:bg-[#161B22] border border-[#21262D] text-[#E6E9EF] text-[10px] font-semibold rounded-lg cursor-pointer transition-all">
            Select Video
          </label>
        </div>
      </div>
    `;
  }

  const timestamps = getExtractionTimestamps();
  return `
    <div class="space-y-3">
      <div class="relative aspect-video rounded-xl overflow-hidden border border-[#21262D] bg-black">
        <video src="${state.videoUrl}" controls muted class="w-full h-full object-contain"></video>
        <button id="clear-video-btn" class="absolute top-1.5 right-1.5 p-1 rounded bg-[#0F1116]/80 hover:bg-red-950/80 text-[#8B93A1] hover:text-red-400 border border-[#21262D]/50 cursor-pointer">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      ${state.videoMetadata ? `
        <div class="grid grid-cols-3 gap-1.5 bg-[#0F1116]/50 border border-[#21262D]/40 rounded-xl p-2 text-[9px] text-[#8B93A1]" style="font-family:var(--font-mono)">
          <div class="text-center"><div class="uppercase text-[8px] mb-0.5">Duration</div><div class="font-bold text-[#E6E9EF]">${state.videoMetadata.duration.toFixed(1)}s</div></div>
          <div class="text-center border-x border-[#21262D]/40"><div class="uppercase text-[8px] mb-0.5">Rate</div><div class="font-bold text-[#E6E9EF]">${state.videoMetadata.fps}.00 fps</div></div>
          <div class="text-center"><div class="uppercase text-[8px] mb-0.5">Est. Frames</div><div class="font-bold text-[#E6E9EF]">${state.videoMetadata.totalFrames}</div></div>
        </div>
      ` : ''}
      <div class="space-y-2 bg-[#0F1116]/25 border border-[#21262D]/30 rounded-xl p-2.5">
        <div class="flex bg-[#0F1116] border border-[#21262D]/60 rounded-lg p-0.5 text-[9px] font-semibold">
          <button type="button" id="extraction-mode-interval"
            class="flex-1 py-1 rounded-sm transition-all cursor-pointer text-center ${state.extractionMode === 'interval' ? 'bg-[#161B22] text-[#3DA9FC]' : 'text-[#8B93A1]'}">
            Interval
          </button>
          <button type="button" id="extraction-mode-fps"
            class="flex-1 py-1 rounded-sm transition-all cursor-pointer text-center ${state.extractionMode === 'fps' ? 'bg-[#161B22] text-[#3DA9FC]' : 'text-[#8B93A1]'}">
            Frequency
          </button>
        </div>
        ${state.extractionMode === 'interval' ? `
          <div class="space-y-1">
            <div class="flex justify-between text-[10px]">
              <span class="text-[#8B93A1]">1 frame every:</span>
              <span class="font-bold text-[#3DA9FC]" style="font-family:var(--font-mono)">${state.extractionInterval === 0.5 ? '0.5s' : state.extractionInterval + 's'}</span>
            </div>
            <input type="range" id="extraction-interval" min="0.5" max="10" step="0.5" value="${state.extractionInterval}" class="w-full">
          </div>
        ` : `
          <div class="space-y-1">
            <div class="flex justify-between text-[10px]">
              <span class="text-[#8B93A1]">Frequency:</span>
              <span class="font-bold text-[#3DA9FC]" style="font-family:var(--font-mono)">${state.extractionFps} fps</span>
            </div>
            <input type="range" id="extraction-fps" min="1" max="10" step="1" value="${state.extractionFps}" class="w-full">
          </div>
        `}
        <div class="flex justify-between items-center text-[10px] bg-[#0F1116]/35 px-2.5 py-1.5 rounded-lg border border-[#21262D]/30">
          <span class="text-[#8B93A1]">Resulting images:</span>
          <span class="font-bold text-[#3DA9FC]" style="font-family:var(--font-mono)">+${timestamps.length} files</span>
        </div>
        ${timestamps.length >= 100 ? `
          <div class="bg-amber-950/20 border border-amber-900/30 p-2 rounded-lg text-[9px] text-amber-400 flex items-start gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span><strong>High frame count:</strong> Extracting ${timestamps.length} images may take a while.</span>
          </div>
        ` : ''}
        <button type="button" id="extract-frames-btn"
          ${state.isExtracting || timestamps.length === 0 ? 'disabled' : ''}
          class="w-full py-2 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#0F1116] text-[10px] font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          ${state.isExtracting ? `
            <svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Extracting...
          ` : `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            Extract Frames
          `}
        </button>
      </div>
      ${state.extractionProgress ? `
        <div class="bg-[#0F1116]/50 border border-[#21262D]/60 p-2.5 rounded-xl flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-[#E6E9EF] font-semibold">Processing Video...</span>
            <span class="text-[#8B93A1]" style="font-family:var(--font-mono)">${state.extractionProgress.current} / ${state.extractionProgress.total}</span>
          </div>
          <div class="w-full bg-[#161B22] h-1 rounded-full overflow-hidden border border-[#21262D]/50">
            <div class="bg-[#3DA9FC] h-full transition-all" style="width:${(state.extractionProgress.current / state.extractionProgress.total * 100).toFixed(1)}%"></div>
          </div>
        </div>
      ` : ''}
      ${state.extractionStatus ? renderStatusBanner(state.extractionStatus) : ''}
    </div>
  `;
}

function renderPipelinePanel(project, splitStats) {
  const classes = project.classes || [];
  const s = state.settings;
  const rawTrainCount = state.images.filter(i => i.split === 'train' && !i.isAugmented).length;

  return `
    <div class="group bg-[#161B22] border border-[#21262D] rounded-2xl overflow-hidden" id="workspace-pipeline-panel">
      ${renderCornerBrackets('amber')}
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#21262D]/60 pb-3">
          <h3 class="font-bold text-xs text-[#E6E9EF] tracking-wider uppercase">2. Processing Pipeline</h3>
        </div>

        <!-- Tabs -->
        <div class="flex bg-[#0F1116] border border-[#21262D]/80 rounded-xl p-1">
          ${['split', 'augment', 'export'].map(tab => `
            <button type="button" id="pipeline-tab-${tab}"
              class="flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                state.pipelineTab === tab
                  ? `bg-[#161B22] border border-[#21262D]/50 ${tab === 'split' ? 'text-[#3DA9FC]' : tab === 'augment' ? 'text-[#FFB020]' : 'text-indigo-400'}`
                  : 'text-[#8B93A1] hover:text-[#E6E9EF]'
              }">
              ${tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          `).join('')}
        </div>

        <!-- Split tab -->
        ${state.pipelineTab === 'split' ? `
          <div class="space-y-4 animate-fade-in" id="pipeline-split-tab">
            <div>
              <h4 class="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider mb-1">Dataset Splits Partition</h4>
              <p class="text-[10px] text-[#8B93A1] leading-relaxed">Partition images into training, validation, and test splits.</p>
            </div>
            <!-- Distribution bar -->
            <div class="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex border border-slate-900">
              ${splitStats.total > 0 ? `
                <div class="bg-[#3DA9FC] h-full transition-all" style="width:${(splitStats.train / splitStats.total * 100).toFixed(1)}%"></div>
                <div class="bg-[#FFB020] h-full transition-all" style="width:${(splitStats.val / splitStats.total * 100).toFixed(1)}%"></div>
                <div class="bg-[#8B93A1] h-full transition-all" style="width:${(splitStats.test / splitStats.total * 100).toFixed(1)}%"></div>
                <div class="bg-slate-700 h-full transition-all" style="width:${(splitStats.unassigned / splitStats.total * 100).toFixed(1)}%"></div>
              ` : '<div class="bg-slate-800 w-full h-full"></div>'}
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px]" style="font-family:var(--font-mono)">
              <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#3DA9FC] shrink-0"></span><span class="text-[#8B93A1]">Train:</span><span class="font-bold text-[#E6E9EF] ml-0.5">${splitStats.train}</span></div>
              <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#FFB020] shrink-0"></span><span class="text-[#8B93A1]">Val:</span><span class="font-bold text-[#E6E9EF] ml-0.5">${splitStats.val}</span></div>
              <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-[#8B93A1] shrink-0"></span><span class="text-[#8B93A1]">Test:</span><span class="font-bold text-[#E6E9EF] ml-0.5">${splitStats.test}</span></div>
              <div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0"></span><span class="text-[#8B93A1]">None:</span><span class="font-bold text-[#E6E9EF] ml-0.5">${splitStats.unassigned}</span></div>
            </div>
            <div class="border-t border-[#21262D]/60 pt-3 space-y-3">
              <div class="grid grid-cols-3 gap-1">
                ${['train', 'val', 'test'].map((split, i) => `
                  <div class="space-y-1">
                    <label class="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block text-center">${split.charAt(0).toUpperCase() + split.slice(1)}%</label>
                    <input type="number" id="split-${split}-input" min="0" max="100"
                      value="${i === 0 ? s.train_percent : i === 1 ? s.val_percent : s.test_percent}"
                      class="w-full px-1 py-1 bg-[#0F1116] border border-[#21262D] text-[#E6E9EF] rounded text-[10px] outline-none focus:ring-1 focus:ring-[#3DA9FC] text-center font-mono font-medium">
                  </div>
                `).join('')}
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" id="include-unannotated" ${s.include_unannotated ? 'checked' : ''}>
                <span class="text-[10px] text-[#8B93A1] select-none">Include unlabeled images</span>
              </label>
              <button type="button" id="auto-split-btn"
                class="w-full py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#0F1116] rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1">
                Randomize Splits
              </button>
              ${state.autoSplitStatus ? renderStatusBanner(state.autoSplitStatus) : ''}
            </div>
          </div>
        ` : ''}

        <!-- Augment tab -->
        ${state.pipelineTab === 'augment' ? `
          <div class="space-y-4 animate-fade-in" id="pipeline-augment-tab">
            <div>
              <div class="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFB020" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <h4 class="text-[11px] font-semibold text-[#FFB020] uppercase tracking-wider">Data Augmentation</h4>
              </div>
              <p class="text-[10px] text-[#8B93A1] leading-relaxed mt-1">Augment your Training split to prevent overfitting. Bounding boxes are transformed to match.</p>
            </div>
            <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              ${[
                ['aug-flip', 'aug_flip', 'Horizontal Flip', 'Mirror images horizontally'],
                ['aug-rotation', 'aug_rotation', 'Random Rotation', 'Slight rot. (±5° to ±15°)'],
                ['aug-brightness', 'aug_brightness', 'Brightness', 'Random darker or brighter'],
                ['aug-exposure', 'aug_exposure', 'Exposure', 'Adjust contrast/brightness'],
                ['aug-noise', 'aug_noise', 'Digital Grain', 'Add fine digital noise'],
              ].map(([id, key, label, desc]) => `
                <label class="flex items-center justify-between p-1.5 rounded-lg bg-[#0F1116]/35 border border-[#21262D]/40 hover:border-[#21262D]/70 cursor-pointer">
                  <div>
                    <div class="text-[10px] font-bold text-[#E6E9EF]">${label}</div>
                    <div class="text-[9px] text-[#8B93A1]">${desc}</div>
                  </div>
                  <input type="checkbox" id="${id}" ${s[key] ? 'checked' : ''} class="ml-2">
                </label>
              `).join('')}
            </div>
            <div class="space-y-1">
              <div class="flex justify-between text-[10px]">
                <span class="text-[#8B93A1]" style="font-family:var(--font-mono)">Multiplier:</span>
                <span class="font-bold text-[#FFB020]" style="font-family:var(--font-mono)" id="aug-variants-label">${s.aug_variants_count}x variants</span>
              </div>
              <input type="range" id="aug-variants-range" min="1" max="5" value="${s.aug_variants_count}" style="accent-color:#FFB020" class="w-full">
            </div>
            <div class="space-y-2 border-t border-[#21262D]/60 pt-3 text-[10px]" style="font-family:var(--font-mono)">
              <div class="flex justify-between text-[#8B93A1]"><span>Train images:</span><span class="text-[#E6E9EF]">${rawTrainCount}</span></div>
              <div class="flex justify-between text-[#FFB020]"><span>Will generate:</span><span class="font-bold">+${rawTrainCount * s.aug_variants_count} files</span></div>
              <button type="button" id="run-augment-btn"
                ${rawTrainCount === 0 || state.augStatus?.type === 'loading' ? 'disabled' : ''}
                class="w-full py-1.5 bg-[#FFB020] hover:bg-[#FFB020]/90 disabled:bg-[#161B22] disabled:text-[#8B93A1]/50 disabled:border disabled:border-[#21262D] disabled:cursor-not-allowed text-[#0F1116] rounded-xl text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1">
                ${state.augStatus?.type === 'loading' ? `
                  <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Generating...
                ` : `
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Generate Augmented
                `}
              </button>
              ${state.images.some(i => i.isAugmented) ? `
                <button type="button" id="clear-augmented-btn"
                  ${state.augStatus?.type === 'loading' ? 'disabled' : ''}
                  class="w-full py-1 bg-[#0F1116] hover:bg-red-950/20 border border-[#21262D] hover:border-red-900/30 text-[#8B93A1] hover:text-red-400 rounded-xl text-[10px] font-semibold cursor-pointer transition-all flex items-center justify-center gap-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Clear Augmented
                </button>
              ` : ''}
              ${state.augStatus ? renderStatusBanner(state.augStatus) : ''}
            </div>
          </div>
        ` : ''}

        <!-- Export tab -->
        ${state.pipelineTab === 'export' ? `
          <div class="space-y-4 animate-fade-in" id="pipeline-export-tab">
            <div>
              <div class="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818CF8" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <h4 class="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">YOLO Export</h4>
              </div>
              <p class="text-[10px] text-[#8B93A1] leading-relaxed mt-1">Package split images + bounding boxes into a production-ready YOLO archive.</p>
            </div>
            <div class="grid grid-cols-3 gap-1 text-center font-mono text-[9px] bg-[#0F1116]/50 rounded-xl p-2 border border-[#21262D]/40">
              <div><div class="text-[#8B93A1]">Train</div><div class="text-[11px] font-bold text-[#E6E9EF] mt-0.5">${splitStats.train}</div></div>
              <div><div class="text-[#8B93A1]">Val</div><div class="text-[11px] font-bold text-[#E6E9EF] mt-0.5">${splitStats.val}</div></div>
              <div><div class="text-[#8B93A1]">Test</div><div class="text-[11px] font-bold text-[#E6E9EF] mt-0.5">${splitStats.test}</div></div>
            </div>
            ${splitStats.unassigned > 0 ? `
              <div class="flex items-start gap-1.5 p-2 rounded-xl bg-[#FFB020]/10 border border-[#FFB020]/25 text-[9px] text-[#FFB020]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                <span>${splitStats.unassigned} unassigned images will be excluded.</span>
              </div>
            ` : ''}
            ${classes.length > 0 ? `
              <div class="space-y-1 border-t border-[#21262D]/60 pt-2.5">
                <span class="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block">Class Indices</span>
                <div class="max-h-20 overflow-y-auto space-y-1 pr-1 text-[9px]">
                  ${classes.map((cls, idx) => `
                    <div class="flex items-center justify-between font-mono bg-[#0F1116]/25 border border-[#21262D]/30 px-1.5 py-0.5 rounded">
                      <span class="text-[#8B93A1] font-bold">${idx}</span>
                      <div class="flex items-center gap-1 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${cls.color}"></span>
                        <span class="text-[#E6E9EF] truncate max-w-[80px]">${escHtml(cls.name)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            <button type="button" id="export-yolo-btn"
              ${(splitStats.train === 0 && splitStats.val === 0 && splitStats.test === 0) || state.exportStatus?.type === 'loading' ? 'disabled' : ''}
              class="w-full py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 disabled:bg-[#161B22] disabled:text-[#8B93A1]/50 disabled:border disabled:border-[#21262D] disabled:cursor-not-allowed text-[#0F1116] rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1">
              ${state.exportStatus?.type === 'loading' ? `
                <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Exporting...
              ` : `
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export YOLO Dataset
              `}
            </button>
            ${state.exportStatus ? renderStatusBanner(state.exportStatus) : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderWorkspaceTip() {
  return `
    <div class="group bg-[#161B22] border border-[#21262D] p-5 rounded-2xl space-y-3">
      ${renderCornerBrackets('slate')}
      <h3 class="font-semibold text-xs text-[#3DA9FC] tracking-wider uppercase">Workflow Tips</h3>
      <p class="text-xs text-[#8B93A1] leading-relaxed">
        1. Define object classes → 2. Upload images → 3. Click images to annotate bounding boxes → 4. Randomize splits → 5. Optionally augment → 6. Export YOLO ZIP.
      </p>
    </div>
  `;
}

// ─── AI Assist Panel ──────────────────────────────────────────────────────────
function renderAIAssistPanel(project) {
  const m = state.projectModel;
  const classes = project.classes || [];

  const hasMappableClasses = m && m.classNames && m.classNames.length > 0;
  const mappingComplete = m && hasMappableClasses &&
    Object.keys(m.classMapping || {}).length === (m.classNames || []).length;
  const needsClassNames = m && (!m.classNames || m.classNames.length === 0);
  const pendingSuggestions = state.images.filter(i => i.hasSuggestions && !i.annotated).length;

  return `
    <div class="group bg-[#161B22] border border-[#21262D] rounded-2xl overflow-hidden" id="ai-assist-panel">
      ${renderCornerBrackets('blue')}
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-[#21262D]/60 pb-3">
          <div class="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <h3 class="font-bold text-xs text-[#E6E9EF] tracking-wider uppercase">3. AI Assist</h3>
          </div>
          ${m ? `
            <span class="font-mono text-[10px] text-[#C084FC] bg-[#0F1116] border border-[#21262D]/80 px-2 py-0.5 rounded">
              ${m.numClasses} classes
            </span>
          ` : `
            <span class="font-mono text-[10px] text-[#4B5563] bg-[#0F1116] border border-[#21262D]/80 px-2 py-0.5 rounded">
              No model
            </span>
          `}
        </div>

        <!-- Model Upload -->
        ${!m ? `
          <div>
            <p class="text-[10px] text-[#8B93A1] mb-2">Upload a trained .onnx object detection model to auto-annotate images.</p>
            <div id="model-dropzone"
              class="relative border border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${state.modelDragActive ? 'border-[#C084FC] bg-[#C084FC]/5' : 'border-[#21262D] bg-[#0F1116]/35 hover:border-[#2A2F38]'}"
              ondragenter="handleModelDrag(event)" ondragover="handleModelDrag(event)" ondragleave="handleModelDrag(event)" ondrop="handleModelDrop(event)">
              <input type="file" id="model-file-input" accept=".onnx" class="hidden">
              <div class="flex flex-col items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="1.5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <p class="text-[10px] text-[#8B93A1]">Drag .onnx here or</p>
                <label for="model-file-input" class="px-2.5 py-1 bg-[#0F1116] hover:bg-[#161B22] border border-[#C084FC]/40 text-[#C084FC] text-[10px] font-semibold rounded-lg cursor-pointer transition-all">
                  Select Model
                </label>
              </div>
            </div>
          </div>
        ` : `
          <!-- Model Info Card -->
          <div class="bg-[#0F1116]/60 border border-[#C084FC]/25 rounded-xl p-3 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 mb-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  <span class="text-[10px] text-[#C084FC] font-bold uppercase tracking-wider">Model Loaded</span>
                </div>
                <p class="text-[11px] font-semibold text-[#E6E9EF] truncate" title="${escHtml(m.filename)}">${escHtml(m.filename)}</p>
                <p class="text-[9px] text-[#8B93A1] font-mono mt-0.5">${m.numClasses} classes · ${m.inputShape[0]}×${m.inputShape[1]} input</p>
              </div>
              <button id="remove-model-btn" class="p-1 rounded hover:bg-red-950/30 text-[#8B93A1] hover:text-red-400 cursor-pointer border border-transparent hover:border-red-900/30 transition-all shrink-0" title="Remove model">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            ${m.classNames && m.classNames.length > 0 ? `
              <div class="flex flex-wrap gap-1">
                ${m.classNames.slice(0, 6).map(n => `
                  <span class="px-1.5 py-0.5 rounded-md bg-[#C084FC]/10 border border-[#C084FC]/20 text-[9px] text-[#C084FC] font-mono">${escHtml(n)}</span>
                `).join('')}
                ${m.classNames.length > 6 ? `<span class="text-[9px] text-[#8B93A1]">+${m.classNames.length - 6} more</span>` : ''}
              </div>
            ` : ''}
          </div>

          <!-- Manual class name entry (when metadata not present) -->
          ${needsClassNames ? `
            <div class="space-y-2" id="manual-classnames-section">
              <div class="flex items-start gap-1.5 p-2 rounded-xl bg-[#FFB020]/10 border border-[#FFB020]/25 text-[9px] text-[#FFB020]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                <span>Class names not found in model metadata. Enter one name per output class.</span>
              </div>
              <div class="flex gap-1.5 mb-1">
                <input type="number" id="model-class-count-input" min="1" max="100" value="${state.pendingClassNames.length || (m.numClasses || 1)}"
                  class="w-16 px-2 py-1 bg-[#0F1116] border border-[#21262D] text-[#E6E9EF] rounded text-[10px] outline-none focus:ring-1 focus:ring-[#C084FC] font-mono text-center" placeholder="#">
                <button type="button" id="init-class-names-btn"
                  class="flex-1 py-1 bg-[#C084FC]/20 hover:bg-[#C084FC]/30 border border-[#C084FC]/30 text-[#C084FC] text-[10px] font-semibold rounded-lg cursor-pointer transition-all">
                  Set # classes
                </button>
              </div>
              ${state.pendingClassNames.length > 0 ? `
                <div class="space-y-1 max-h-32 overflow-y-auto pr-1" id="class-name-inputs">
                  ${state.pendingClassNames.map((name, i) => `
                    <div class="flex items-center gap-1.5">
                      <span class="text-[9px] text-[#4B5563] font-mono w-4 text-right shrink-0">${i}</span>
                      <input type="text" class="model-class-name-input flex-1 px-2 py-1 bg-[#0F1116] border border-[#21262D] text-[#E6E9EF] rounded text-[10px] outline-none focus:ring-1 focus:ring-[#C084FC] font-mono"
                        data-idx="${i}" value="${escHtml(name)}" placeholder="class_${i}">
                    </div>
                  `).join('')}
                </div>
                <button type="button" id="save-class-names-btn"
                  class="w-full py-1.5 bg-[#C084FC] hover:bg-[#C084FC]/90 text-[#0F1116] rounded-xl text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1">
                  Save Class Names
                </button>
              ` : ''}
            </div>
          ` : ''}

          <!-- Class Mapping -->
          ${hasMappableClasses ? `
            <div class="space-y-2" id="class-mapping-section">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase font-mono tracking-wider text-[#8B93A1]">Class Mapping</span>
                ${mappingComplete ? `
                  <span class="flex items-center gap-1 text-[9px] text-[#00E5A3] font-mono">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                    Saved
                  </span>
                ` : `
                  <span class="text-[9px] text-[#FFB020] font-mono">Incomplete</span>
                `}
              </div>
              <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                ${(m.classNames || []).map((name, idx) => {
                  const mapped = (m.classMapping || {})[String(idx)];
                  const mappedClass = classes.find(c => c.id === mapped);
                  return `
                    <div class="flex items-center gap-1.5 text-[10px]">
                      <span class="font-mono text-[#C084FC] w-4 text-right shrink-0">${idx}</span>
                      <span class="text-[#E6E9EF] truncate flex-1 min-w-0" title="${escHtml(name)}">${escHtml(name)}</span>
                      <span class="text-[#4B5563]">→</span>
                      <select class="class-mapping-select bg-[#0F1116] border border-[#21262D] text-[9px] text-[#E6E9EF] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-[#C084FC] cursor-pointer max-w-[90px]"
                        data-model-idx="${idx}">
                        <option value="">-- Map --</option>
                        ${classes.map(c => `
                          <option value="${c.id}" ${mapped === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>
                        `).join('')}
                        <option value="NEW:${escHtml(name)}" ${!mapped ? 'selected' : ''}>+ Create "${escHtml(name)}"</option>
                      </select>
                    </div>
                  `;
                }).join('')}
              </div>
              <button type="button" id="save-mapping-btn"
                class="w-full py-1.5 bg-[#C084FC]/20 hover:bg-[#C084FC]/30 border border-[#C084FC]/30 text-[#C084FC] rounded-xl text-[10px] font-bold cursor-pointer transition-all flex items-center justify-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Save Mapping
              </button>
            </div>
          ` : ''}

          <!-- Inference Controls -->
          ${(mappingComplete || (m && Object.keys(m.classMapping || {}).length > 0)) ? `
            <div class="border-t border-[#21262D]/60 pt-3 space-y-3" id="inference-controls">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase font-mono tracking-wider text-[#8B93A1]">Run Inference</span>
                ${pendingSuggestions > 0 ? `
                  <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold font-mono bg-[#FFB020]/15 border border-[#FFB020]/25 text-[#FFB020]">
                    ${pendingSuggestions} pending
                  </span>
                ` : ''}
              </div>
              <!-- Confidence slider -->
              <div class="space-y-1">
                <div class="flex justify-between text-[10px]">
                  <span class="text-[#8B93A1]">Confidence:</span>
                  <span class="font-bold font-mono text-[#C084FC]" id="conf-threshold-label">${(state.aiConfidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <input type="range" id="conf-threshold-slider" min="10" max="95" step="5"
                  value="${Math.round(state.aiConfidenceThreshold * 100)}"
                  style="accent-color:#C084FC" class="w-full">
              </div>
              <!-- Run buttons -->
              <div class="flex flex-col gap-1.5">
                <button type="button" id="run-inference-unannotated-btn"
                  ${state.inferenceRunning ? 'disabled' : ''}
                  class="w-full py-1.5 bg-[#C084FC] hover:bg-[#C084FC]/90 disabled:opacity-50 disabled:cursor-not-allowed text-[#0F1116] rounded-xl text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5">
                  ${state.inferenceRunning ? `
                    <svg class="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Running...
                  ` : `
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Run on Unannotated
                  `}
                </button>
              </div>
              <!-- Progress -->
              ${state.inferenceProgress ? `
                <div class="bg-[#0F1116]/50 border border-[#21262D]/60 p-2 rounded-xl space-y-1">
                  <div class="flex items-center justify-between text-[10px]">
                    <span class="text-[#E6E9EF] font-semibold">Inferencing...</span>
                    <span class="text-[#C084FC] font-mono">${state.inferenceProgress.current} / ${state.inferenceProgress.total}</span>
                  </div>
                  <div class="w-full bg-[#161B22] h-1 rounded-full overflow-hidden border border-[#21262D]/50">
                    <div class="bg-[#C084FC] h-full transition-all progress-bar-fill" style="width:${(state.inferenceProgress.current / state.inferenceProgress.total * 100).toFixed(1)}%"></div>
                  </div>
                </div>
              ` : ''}
              ${state.inferenceStatus ? `
                <div class="${state.inferenceStatus.type === 'success' ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' : state.inferenceStatus.type === 'error' ? 'bg-red-950/20 border-red-900/30 text-red-400' : 'bg-[#C084FC]/10 border-[#C084FC]/20 text-[#C084FC]'} text-[9px] p-2 rounded-xl border leading-normal">
                  ${state.inferenceStatus.message}
                </div>
              ` : ''}
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `;
}

function renderImageGallery() {
  const filtered = getFilteredImages();

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-sm text-slate-300">Project Images Grid</h3>
        <span class="font-mono text-xs text-slate-500 bg-slate-900/50 border border-slate-800/60 px-2 py-0.5 rounded">
          Total: ${state.images.length} image${state.images.length !== 1 ? 's' : ''}
        </span>
      </div>

      ${state.images.length > 0 ? `
        <!-- Filters bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13161B] border border-slate-800 rounded-2xl p-3">
          <div class="flex flex-wrap items-center gap-4">
            <div class="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider" style="font-family:var(--font-mono)">Split:</span>
              <div class="flex bg-slate-900 border border-slate-800/80 rounded-xl p-0.5 flex-wrap" id="split-filter-tabs">
                ${['all', 'train', 'val', 'test', 'unassigned'].map(split => `
                  <button type="button" data-split="${split}"
                    class="split-filter-btn px-2 py-1 text-[10px] font-semibold rounded-lg capitalize transition-all cursor-pointer ${
                      state.splitFilter === split
                        ? 'bg-slate-800 text-indigo-400 border border-slate-700/40 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }">
                    ${split === 'all' ? 'All' : split === 'unassigned' ? 'None' : split}
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-1.5">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider" style="font-family:var(--font-mono)">Status:</span>
              <div class="flex bg-slate-900 border border-slate-800/80 rounded-xl p-0.5 flex-wrap" id="annotation-filter-tabs">
                ${['all', 'annotated', 'not-annotated'].map(status => `
                  <button type="button" data-annotation="${status}"
                    class="annotation-filter-btn px-2 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
                      state.annotationFilter === status
                        ? 'bg-slate-800 text-indigo-400 border border-slate-700/40 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }">
                    ${status === 'all' ? 'All' : status === 'annotated' ? 'Annotated' : 'Unlabeled'}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
          <span class="text-[10px] text-slate-500 font-mono">Filtered: ${filtered.length} / ${state.images.length}</span>
        </div>
      ` : ''}

      ${state.skippedFiles.length > 0 ? `
        <div class="bg-amber-950/20 border border-amber-900/35 rounded-2xl p-4 flex items-start justify-between">
          <div class="flex items-start gap-3 text-amber-400">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <div>
              <p class="text-xs font-semibold">Non-image files skipped</p>
              <p class="text-[11px] text-amber-500/80 mt-0.5">${state.skippedFiles.length} file(s) were not imported.</p>
            </div>
          </div>
          <button id="dismiss-skipped-btn" class="text-amber-500 hover:text-amber-300 cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      ` : ''}

      ${state.imagesLoading ? `
        <div class="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <svg class="animate-spin text-indigo-400" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <span class="text-xs">Loading workspace files...</span>
        </div>
      ` : state.images.length > 0 ? (
        filtered.length > 0 ? `
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" id="images-grid">
            ${filtered.map(img => renderImageCard(img)).join('')}
          </div>
        ` : `
          <div class="text-center py-16 bg-[#161B22] border border-dashed border-slate-800 rounded-2xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" class="mx-auto mb-3"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <h4 class="font-semibold text-sm text-slate-200">No matching images</h4>
            <p class="text-xs text-slate-400 max-w-sm mx-auto mt-1">Try toggling your filter options above.</p>
          </div>
        `
      ) : `
        <div class="text-center py-20 bg-[#161B22] border border-dashed border-slate-800 rounded-2xl">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="1.5" class="mx-auto mb-4"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <h4 class="font-semibold text-base text-slate-200">No images yet</h4>
          <p class="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">Drag & drop images or use the file selector in the setup panel to import images.</p>
        </div>
      `}
    </div>
  `;
}

function renderImageCard(img) {
  const hasBoxes = img.annotations && img.annotations.length > 0;
  const hasSugs = img.hasSuggestions && img.aiSuggestions && img.aiSuggestions.length > 0;
  // bottom-border accent: green=confirmed, amber=AI pending, grey=unannotated
  const borderColor = hasBoxes ? '#00E5A3' : hasSugs ? '#FFB020' : '#374151';
  return `
    <div class="group/img relative bg-[#161B22] border border-b-4 rounded-2xl overflow-hidden aspect-video transition-all duration-200 flex flex-col justify-between cursor-pointer"
    style="border-color:#21262D;border-bottom-color:${borderColor}"
    data-image-id="${img.id}" id="image-card-${img.id}">
      <img src="${img.dataUrl}" alt="${escHtml(img.name)}" class="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" loading="lazy">

      ${img.isAugmented ? `
        <div class="absolute top-2 left-2 z-10 text-[#FFB020]" title="Augmented Variant">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,176,32,0.2)" stroke="#FFB020" stroke-width="2" class="animate-pulse-dot"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
      ` : ''}

      <!-- AI suggestion chip (shown when there are pending AI suggestions and no confirmed boxes) -->
      ${hasSugs && !hasBoxes ? `
        <div class="absolute top-2 left-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FFB020]/15 border border-[#FFB020]/40">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFB020" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <span class="text-[8px] font-bold font-mono text-[#FFB020]">${img.aiSuggestions.length} AI</span>
        </div>
      ` : ''}

      <!-- Split badge -->
      <div class="absolute top-2 right-2 z-10">
        ${img.split === 'train' ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#3DA9FC] text-[#0F1116] uppercase">TRAIN</span>` : ''}
        ${img.split === 'val' ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#FFB020] text-[#0F1116] uppercase">VAL</span>` : ''}
        ${img.split === 'test' ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#8B93A1] text-[#0F1116] uppercase">TEST</span>` : ''}
        ${(!img.split || img.split === 'unassigned') ? `<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-950/70 border border-[#21262D]/50 text-[#8B93A1] uppercase">UNSPLIT</span>` : ''}
      </div>

      <!-- Hover overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-[#0A0D12]/95 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col justify-end p-2">
        <p class="text-[10px] text-slate-200 font-medium truncate" title="${escHtml(img.name)}">${escHtml(img.name)}</p>
        <div class="flex items-center justify-between mt-1">
          <span class="text-[9px] text-[#8B93A1]" style="font-family:var(--font-mono)">${formatBytes(img.size)}</span>
          <div class="flex items-center gap-1.5">
            <select class="image-split-select bg-slate-900 border border-slate-800 text-slate-300 text-[10px] rounded px-1.5 py-0.5 outline-none cursor-pointer font-semibold"
                    data-image-id="${img.id}" onclick="event.stopPropagation()">
              <option value="unassigned" ${!img.split || img.split === 'unassigned' ? 'selected' : ''}>Unassigned</option>
              <option value="train" ${img.split === 'train' ? 'selected' : ''}>Train</option>
              <option value="val" ${img.split === 'val' ? 'selected' : ''}>Val</option>
              <option value="test" ${img.split === 'test' ? 'selected' : ''}>Test</option>
            </select>
            <button class="delete-image-btn p-1 rounded bg-red-950/50 text-red-400 border border-red-900/30 hover:bg-red-900/45 cursor-pointer"
                    data-image-id="${img.id}" onclick="event.stopPropagation()" title="Delete image">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStatusBanner(status) {
  if (!status) return '';
  const isError = status.type === 'error';
  const isSuccess = status.type === 'success';
  const isLoading = status.type === 'loading';
  const cls = isSuccess
    ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
    : isError
    ? 'bg-red-950/20 border-red-900/30 text-red-400'
    : 'bg-[#3DA9FC]/10 border-[#3DA9FC]/20 text-[#3DA9FC]';
  return `
    <div class="${cls} text-[9px] p-2 rounded-xl border leading-normal">
      ${status.message}
      ${status.progress !== undefined && isLoading ? `<div class="mt-1.5 w-full bg-[#0F1116] h-1 rounded-full overflow-hidden"><div class="bg-[#3DA9FC] h-full progress-bar-fill" style="width:${status.progress}%"></div></div>` : ''}
    </div>
  `;
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function renderModals() {
  return `
    <div id="create-project-modal-container"></div>
    <div id="delete-project-modal-container"></div>
  `;
}

function showCreateModal() {
  const container = document.getElementById('create-project-modal-container');
  container.innerHTML = `
    <div class="modal-overlay" id="create-modal-overlay">
      <div class="relative w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 z-10 text-slate-200 animate-slide-up" id="create-project-modal">
        <div class="flex items-center justify-between pb-4 border-b border-slate-800">
          <div class="flex items-center gap-2.5">
            <div class="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-indigo-400">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            </div>
            <h3 class="font-semibold text-base text-slate-100">Create New Project</h3>
          </div>
          <button id="close-create-modal" class="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-900 cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="create-project-form" class="mt-5 space-y-5">
          <div>
            <label for="project-name-input" class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Project Name</label>
            <input id="project-name-input" type="text" required placeholder="e.g. Traffic Light Annotations"
              class="w-full px-4 py-3 border border-slate-800 rounded-xl text-sm bg-slate-900 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" autofocus>
            <p class="text-[11px] text-slate-500 mt-2 leading-relaxed">Choose a clear name reflecting the class of images you'll annotate.</p>
          </div>
          <div class="flex items-center justify-end gap-3 pt-1">
            <button type="button" id="cancel-create-btn" class="px-4 py-2.5 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 cursor-pointer transition-colors">Cancel</button>
            <button type="submit" id="submit-project-btn" class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer transition-all">Create Project</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('close-create-modal').onclick = () => container.innerHTML = '';
  document.getElementById('cancel-create-btn').onclick = () => container.innerHTML = '';
  document.getElementById('create-modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) container.innerHTML = ''; };
  document.getElementById('create-project-form').onsubmit = handleCreateProject;
}

function showDeleteModal(project) {
  const container = document.getElementById('delete-project-modal-container');
  container.innerHTML = `
    <div class="modal-overlay" id="delete-modal-overlay">
      <div class="relative w-full max-w-md bg-[#161B22] border border-slate-800 rounded-2xl shadow-2xl p-6 z-10 text-slate-200 animate-slide-up" id="delete-confirmation-modal">
        <div class="flex items-start gap-4">
          <div class="p-2.5 rounded-full bg-red-950/40 text-red-400 border border-red-900/30 shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <h3 class="font-semibold text-base text-slate-100">Delete Project?</h3>
            <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">
              This will permanently delete <strong class="text-slate-200">"${escHtml(project.name)}"</strong> and all associated images and annotations. This action cannot be undone.
            </p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-3 mt-6">
          <button id="cancel-delete-btn" class="px-4 py-2.5 border border-slate-800 text-slate-300 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 cursor-pointer">Cancel</button>
          <button id="confirm-delete-btn" class="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl cursor-pointer">Delete Permanently</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('cancel-delete-btn').onclick = () => container.innerHTML = '';
  document.getElementById('delete-modal-overlay').onclick = (e) => { if (e.target === e.currentTarget) container.innerHTML = ''; };
  document.getElementById('confirm-delete-btn').onclick = () => handleDeleteProject(project.id);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function attachEventListeners() {
  // Home events
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.oninput = (e) => { state.searchQuery = e.target.value; render(); };
  }
  const clearSearch = document.getElementById('clear-search');
  if (clearSearch) clearSearch.onclick = () => { state.searchQuery = ''; render(); };

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.onchange = (e) => { state.sortBy = e.target.value; render(); };

  const newProjectBtn = document.getElementById('new-project-btn');
  if (newProjectBtn) newProjectBtn.onclick = showCreateModal;

  const createFirstBtn = document.getElementById('create-first-project-btn');
  if (createFirstBtn) createFirstBtn.onclick = showCreateModal;

  // Project cards
  document.querySelectorAll('[data-project-id]').forEach(card => {
    if (card.classList.contains('delete-project-btn')) return;
    card.onclick = (e) => {
      if (e.target.closest('.delete-project-btn')) return;
      const id = card.dataset.projectId;
      if (id) openProject(id);
    };
  });
  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const project = state.projects.find(p => p.id === btn.dataset.projectId);
      if (project) showDeleteModal(project);
    };
  });

  // Workspace events
  const backBtn = document.getElementById('back-to-projects-btn');
  if (backBtn) backBtn.onclick = () => { state.activeProjectId = null; state.images = []; render(); };

  // Add class form
  const addClassForm = document.getElementById('add-class-form');
  if (addClassForm) {
    addClassForm.onsubmit = handleAddClass;
    const classInput = document.getElementById('class-name-input');
    if (classInput) {
      classInput.oninput = (e) => { state.newClassName = e.target.value; state.classError = null; };
    }
  }

  // Delete class buttons
  document.querySelectorAll('.delete-class-btn').forEach(btn => {
    btn.onclick = () => handleDeleteClass(btn.dataset.classId);
  });

  // Import mode
  const imageModeBtn = document.getElementById('import-mode-images');
  if (imageModeBtn) imageModeBtn.onclick = () => { state.importMode = 'images'; state.extractionStatus = null; renderWorkspacePartial(); };
  const videoModeBtn = document.getElementById('import-mode-video');
  if (videoModeBtn) videoModeBtn.onclick = () => { state.importMode = 'video'; state.extractionStatus = null; renderWorkspacePartial(); };

  // Image upload
  const fileInput = document.getElementById('image-file-input');
  if (fileInput) fileInput.onchange = (e) => { if (e.target.files.length > 0) processFiles(e.target.files); };

  // Video
  const videoInput = document.getElementById('video-file-input');
  if (videoInput) videoInput.onchange = (e) => { if (e.target.files.length > 0) handleVideoSelect(e.target.files[0]); };

  const clearVideoBtn = document.getElementById('clear-video-btn');
  if (clearVideoBtn) clearVideoBtn.onclick = clearSelectedVideo;

  // Extraction controls
  const extractionModeInterval = document.getElementById('extraction-mode-interval');
  if (extractionModeInterval) extractionModeInterval.onclick = () => { state.extractionMode = 'interval'; renderWorkspacePartial(); };
  const extractionModeFps = document.getElementById('extraction-mode-fps');
  if (extractionModeFps) extractionModeFps.onclick = () => { state.extractionMode = 'fps'; renderWorkspacePartial(); };

  const intervalSlider = document.getElementById('extraction-interval');
  if (intervalSlider) intervalSlider.oninput = (e) => { state.extractionInterval = parseFloat(e.target.value); renderWorkspacePartial(); };
  const fpsSlider = document.getElementById('extraction-fps');
  if (fpsSlider) fpsSlider.oninput = (e) => { state.extractionFps = parseInt(e.target.value); renderWorkspacePartial(); };

  const extractBtn = document.getElementById('extract-frames-btn');
  if (extractBtn) extractBtn.onclick = handleExtractFrames;

  // Pipeline tabs
  ['split', 'augment', 'export'].forEach(tab => {
    const btn = document.getElementById(`pipeline-tab-${tab}`);
    if (btn) btn.onclick = () => { state.pipelineTab = tab; renderWorkspacePartial(); };
  });

  // Split inputs
  ['train', 'val', 'test'].forEach(split => {
    const input = document.getElementById(`split-${split}-input`);
    if (input) input.oninput = (e) => {
      state.settings[`${split}_percent`] = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
      state.autoSplitStatus = null;
      saveSettings();
    };
  });
  const includeUnannotated = document.getElementById('include-unannotated');
  if (includeUnannotated) includeUnannotated.onchange = (e) => {
    state.settings.include_unannotated = e.target.checked;
    state.autoSplitStatus = null;
    saveSettings();
  };
  const autoSplitBtn = document.getElementById('auto-split-btn');
  if (autoSplitBtn) autoSplitBtn.onclick = handleAutoSplit;

  // Augmentation
  [['aug-flip','aug_flip'],['aug-rotation','aug_rotation'],['aug-brightness','aug_brightness'],['aug-exposure','aug_exposure'],['aug-noise','aug_noise']].forEach(([id, key]) => {
    const cb = document.getElementById(id);
    if (cb) cb.onchange = (e) => { state.settings[key] = e.target.checked; saveSettings(); updateAugCountDisplay(); };
  });
  const augVariantsRange = document.getElementById('aug-variants-range');
  if (augVariantsRange) augVariantsRange.oninput = (e) => {
    state.settings.aug_variants_count = parseInt(e.target.value);
    saveSettings();
    updateAugCountDisplay();
  };
  const runAugBtn = document.getElementById('run-augment-btn');
  if (runAugBtn) runAugBtn.onclick = handleRunAugmentation;
  const clearAugBtn = document.getElementById('clear-augmented-btn');
  if (clearAugBtn) clearAugBtn.onclick = handleClearAugmented;

  // Export
  const exportBtn = document.getElementById('export-yolo-btn');
  if (exportBtn) exportBtn.onclick = handleExportDataset;

  // Image grid events
  document.querySelectorAll('[data-image-id]').forEach(card => {
    if (card.classList.contains('image-split-select') || card.classList.contains('delete-image-btn')) return;
    card.onclick = (e) => {
      if (e.target.closest('.image-split-select') || e.target.closest('.delete-image-btn')) return;
      const id = card.dataset.imageId;
      if (id) openAnnotator(id);
    };
  });
  document.querySelectorAll('.image-split-select').forEach(sel => {
    sel.onchange = (e) => handleManualSplitChange(sel.dataset.imageId, e.target.value);
  });
  document.querySelectorAll('.delete-image-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); handleDeleteImage(btn.dataset.imageId); };
  });

  // Split/annotation filters
  document.querySelectorAll('.split-filter-btn').forEach(btn => {
    btn.onclick = () => { state.splitFilter = btn.dataset.split; renderGalleryPartial(); };
  });
  document.querySelectorAll('.annotation-filter-btn').forEach(btn => {
    btn.onclick = () => { state.annotationFilter = btn.dataset.annotation; renderGalleryPartial(); };
  });

  // Dismiss
  const dismissSkipped = document.getElementById('dismiss-skipped-btn');
  if (dismissSkipped) dismissSkipped.onclick = () => { state.skippedFiles = []; renderGalleryPartial(); };
  const clearSkipped = document.getElementById('clear-skipped');
  if (clearSkipped) clearSkipped.onclick = () => { state.skippedFiles = []; renderWorkspacePartial(); };

  // ── AI Assist panel events ─────────────────────────────────────────────────

  // Model file input (select)
  const modelFileInput = document.getElementById('model-file-input');
  if (modelFileInput) modelFileInput.onchange = (e) => { if (e.target.files.length > 0) handleModelUpload(e.target.files[0]); };

  // Remove model button
  const removeModelBtn = document.getElementById('remove-model-btn');
  if (removeModelBtn) removeModelBtn.onclick = handleRemoveModel;

  // Manual class count → populate name inputs
  const initClassNamesBtn = document.getElementById('init-class-names-btn');
  if (initClassNamesBtn) initClassNamesBtn.onclick = () => {
    const countInput = document.getElementById('model-class-count-input');
    const count = Math.max(1, Math.min(100, parseInt(countInput?.value) || 1));
    state.pendingClassNames = Array.from({ length: count }, (_, i) => state.pendingClassNames[i] || '');
    renderWorkspacePartial();
  };

  // Live update pendingClassNames when user types in name inputs
  document.querySelectorAll('.model-class-name-input').forEach(input => {
    input.oninput = (e) => { state.pendingClassNames[parseInt(e.target.dataset.idx)] = e.target.value; };
  });

  // Save class names
  const saveClassNamesBtn = document.getElementById('save-class-names-btn');
  if (saveClassNamesBtn) saveClassNamesBtn.onclick = handleSaveModelClasses;

  // Class mapping selects (live update — saved on "Save Mapping")
  document.querySelectorAll('.class-mapping-select').forEach(sel => {
    sel.onchange = (e) => {
      const idx = e.target.dataset.modelIdx;
      state.pendingMappingEdits[idx] = e.target.value;
    };
  });

  // Save mapping button
  const saveMappingBtn = document.getElementById('save-mapping-btn');
  if (saveMappingBtn) saveMappingBtn.onclick = handleSaveMapping;

  // Confidence slider (live label update only — applied on run)
  const confSlider = document.getElementById('conf-threshold-slider');
  if (confSlider) {
    confSlider.oninput = (e) => {
      state.aiConfidenceThreshold = parseInt(e.target.value) / 100;
      const label = document.getElementById('conf-threshold-label');
      if (label) label.textContent = `${e.target.value}%`;
    };
  }

  // Run inference on unannotated
  const runInfBtn = document.getElementById('run-inference-unannotated-btn');
  if (runInfBtn) runInfBtn.onclick = handleRunInferenceUnannotated;
}

// ─── Partial Re-renders (for performance) ─────────────────────────────────────
function renderWorkspacePartial() {
  const project = getActiveProject();
  if (!project) return;
  const splitStats = getSplitStats();
  const setupPanel = document.getElementById('workspace-setup-panel');
  if (setupPanel) setupPanel.outerHTML = renderSetupPanel(project);
  const pipelinePanel = document.getElementById('workspace-pipeline-panel');
  if (pipelinePanel) pipelinePanel.outerHTML = renderPipelinePanel(project, splitStats);
  const aiPanel = document.getElementById('ai-assist-panel');
  if (aiPanel) aiPanel.outerHTML = renderAIAssistPanel(project);
  // Re-attach
  attachEventListeners();
}

function renderGalleryPartial() {
  const galleryContainer = document.querySelector('.lg\\:col-span-3');
  if (galleryContainer) {
    galleryContainer.innerHTML = renderImageGallery();
    attachEventListeners();
  }
}

function updateAugCountDisplay() {
  const label = document.getElementById('aug-variants-label');
  if (label) label.textContent = `${state.settings.aug_variants_count}x variants`;
  // Update will generate count
  const rawTrainCount = state.images.filter(i => i.split === 'train' && !i.isAugmented).length;
  const willGenEl = document.querySelector('#pipeline-augment-tab .text-\\[\\#FFB020\\] span:last-child');
  if (willGenEl) willGenEl.textContent = `+${rawTrainCount * state.settings.aug_variants_count} files`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleCreateProject(e) {
  e.preventDefault();
  const input = document.getElementById('project-name-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    const project = await window.API.createProject(name);
    state.projects.unshift(project);
    document.getElementById('create-project-modal-container').innerHTML = '';
    render();
    showToast(`Project "${project.name}" created!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to create project', 'error');
  }
}

async function handleDeleteProject(id) {
  try {
    await window.API.deleteProject(id);
    state.projects = state.projects.filter(p => p.id !== id);
    if (state.activeProjectId === id) { state.activeProjectId = null; state.images = []; }
    document.getElementById('delete-project-modal-container').innerHTML = '';
    render();
    showToast('Project deleted.', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to delete project', 'error');
  }
}

async function openProject(id) {
  state.activeProjectId = id;
  state.images = [];
  state.imagesLoading = true;
  state.pipelineTab = 'split';
  state.splitFilter = 'all';
  state.annotationFilter = 'all';
  state.autoSplitStatus = null;
  state.augStatus = null;
  state.exportStatus = null;
  state.importMode = 'images';
  state.projectModel = null;
  state.inferenceRunning = false;
  state.inferenceProgress = null;
  state.inferenceStatus = null;
  state.pendingClassNames = [];
  state.pendingMappingEdits = {};
  clearVideoState();
  render();
  try {
    const [images] = await Promise.all([
      window.API.getImages(id),
    ]);
    state.images = images;
    // Load model info (silently — 404 = no model)
    try {
      state.projectModel = await window.API.getModel(id);
      if (state.projectModel && state.projectModel.confidenceThreshold) {
        state.aiConfidenceThreshold = state.projectModel.confidenceThreshold;
      }
    } catch (e) {
      state.projectModel = null;
    }
  } catch (err) {
    showToast('Failed to load images.', 'error');
  } finally {
    state.imagesLoading = false;
    render();
  }
}

async function handleAddClass(e) {
  e.preventDefault();
  const project = getActiveProject();
  if (!project) return;
  const name = state.newClassName.trim();
  if (!name) return;

  // Check duplicate client-side
  if ((project.classes || []).some(c => c.name.toLowerCase() === name.toLowerCase())) {
    state.classError = 'Class name already exists';
    renderWorkspacePartial();
    return;
  }

  const color = CLASS_COLORS[(project.classes || []).length % CLASS_COLORS.length];
  try {
    const cls = await window.API.addClass(project.id, name, color);
    // Update local state
    const proj = state.projects.find(p => p.id === project.id);
    if (proj) {
      if (!proj.classes) proj.classes = [];
      proj.classes.push(cls);
    }
    state.newClassName = '';
    state.classError = null;
    renderWorkspacePartial();
  } catch (err) {
    state.classError = err.message || 'Failed to add class';
    renderWorkspacePartial();
  }
}

async function handleDeleteClass(classId) {
  const project = getActiveProject();
  if (!project) return;
  try {
    await window.API.deleteClass(project.id, classId);
    const proj = state.projects.find(p => p.id === project.id);
    if (proj) proj.classes = (proj.classes || []).filter(c => c.id !== classId);
    renderWorkspacePartial();
  } catch (err) {
    showToast(err.message || 'Failed to delete class', 'error');
  }
}

// Drag and drop
function handleDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  state.dragActive = e.type === 'dragenter' || e.type === 'dragover';
  const zone = document.getElementById('image-dropzone');
  if (zone) {
    zone.className = zone.className.replace(/border-\[#\w+\]|bg-\[#\w+\]\/5?/, '');
    if (state.dragActive) {
      zone.classList.add('border-[#3DA9FC]', 'bg-[#3DA9FC]/5');
    } else {
      zone.classList.add('border-[#21262D]', 'bg-[#0F1116]/35');
    }
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  state.dragActive = false;
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    processFiles(e.dataTransfer.files);
  }
}

function handleVideoDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  state.videoDragActive = e.type === 'dragenter' || e.type === 'dragover';
}

function handleVideoDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  state.videoDragActive = false;
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.startsWith('video/')) {
      handleVideoSelect(file);
    } else {
      state.extractionStatus = { type: 'error', message: 'Please select a valid video file.' };
      renderWorkspacePartial();
    }
  }
}

async function processFiles(files) {
  if (!state.activeProjectId) return;
  const fileList = Array.from(files);
  const imageFiles = fileList.filter(f => f.type.startsWith('image/'));
  const skipped = fileList.filter(f => !f.type.startsWith('image/')).map(f => f.name);
  if (skipped.length > 0) state.skippedFiles = [...new Set([...state.skippedFiles, ...skipped])];
  if (imageFiles.length === 0) { renderWorkspacePartial(); return; }

  state.importProgress = { current: 0, total: imageFiles.length };
  renderWorkspacePartial();

  const newImages = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    try {
      const img = await window.API.uploadImage(state.activeProjectId, file);
      newImages.push(img);
      state.importProgress = { current: i + 1, total: imageFiles.length };

      // Update image count in project
      const proj = state.projects.find(p => p.id === state.activeProjectId);
      if (proj) proj.imageCount = (proj.imageCount || 0) + 1;

      // Throttle re-render
      if (i % 5 === 0 || i === imageFiles.length - 1) renderWorkspacePartial();
    } catch (err) {
      console.error('Error uploading:', file.name, err);
    }
  }

  state.images = [...state.images, ...newImages];
  setTimeout(() => { state.importProgress = null; renderWorkspacePartial(); renderGalleryPartial(); }, 1000);
}

async function handleDeleteImage(imageId) {
  try {
    await window.API.deleteImage(imageId);
    state.images = state.images.filter(i => i.id !== imageId);
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    if (proj) proj.imageCount = Math.max(0, (proj.imageCount || 0) - 1);
    renderGalleryPartial();
  } catch (err) {
    showToast(err.message || 'Failed to delete image', 'error');
  }
}

async function handleManualSplitChange(imageId, split) {
  try {
    const updated = await window.API.updateSplit(imageId, split);
    const idx = state.images.findIndex(i => i.id === imageId);
    if (idx !== -1) state.images[idx] = updated;
    renderGalleryPartial();
    // Update stats
    const statsEl = document.getElementById('workspace-stats-dashboard');
    if (statsEl) statsEl.outerHTML = document.getElementById('workspace-stats-dashboard')?.outerHTML || '';
  } catch (err) {
    showToast('Failed to update split.', 'error');
  }
}

async function handleAutoSplit() {
  const s = state.settings;
  const total = s.train_percent + s.val_percent + s.test_percent;
  if (total !== 100) {
    state.autoSplitStatus = { type: 'error', message: `Percentages must sum to 100%. Current: ${total}%` };
    renderWorkspacePartial();
    return;
  }
  try {
    const updated = await window.API.autoSplit(
      state.activeProjectId, s.train_percent, s.val_percent, s.test_percent, s.include_unannotated
    );
    state.images = updated;
    const n = updated.filter(i => i.split !== 'unassigned').length;
    const trainN = updated.filter(i => i.split === 'train').length;
    const valN = updated.filter(i => i.split === 'val').length;
    const testN = updated.filter(i => i.split === 'test').length;
    state.autoSplitStatus = { type: 'success', message: `Split ${n} images! (${trainN} Train, ${valN} Val, ${testN} Test)` };
    render();
  } catch (err) {
    state.autoSplitStatus = { type: 'error', message: err.message || 'Auto-split failed.' };
    renderWorkspacePartial();
  }
}

async function handleRunAugmentation() {
  const s = state.settings;
  if (!s.aug_flip && !s.aug_rotation && !s.aug_brightness && !s.aug_exposure && !s.aug_noise) {
    state.augStatus = { type: 'error', message: 'Enable at least one augmentation technique.' };
    renderWorkspacePartial();
    return;
  }
  state.augStatus = { type: 'loading', message: 'Generating augmented variants on server...', progress: 0 };
  renderWorkspacePartial();
  try {
    const generated = await window.API.runAugmentation(state.activeProjectId, {
      flip: s.aug_flip, rotation: s.aug_rotation, brightness: s.aug_brightness,
      exposure: s.aug_exposure, noise: s.aug_noise, variants_count: s.aug_variants_count
    });
    state.images = [...state.images, ...generated];
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    if (proj) proj.imageCount = (proj.imageCount || 0) + generated.length;
    state.augStatus = { type: 'success', message: `Generated ${generated.length} augmented variants!` };
    render();
  } catch (err) {
    state.augStatus = { type: 'error', message: err.message || 'Augmentation failed.' };
    renderWorkspacePartial();
  }
}

async function handleClearAugmented() {
  state.augStatus = { type: 'loading', message: 'Clearing augmented images...' };
  renderWorkspacePartial();
  try {
    const result = await window.API.clearAugmented(state.activeProjectId);
    state.images = state.images.filter(i => !i.isAugmented);
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    if (proj) proj.imageCount = Math.max(0, (proj.imageCount || 0) - result.deleted_count);
    state.augStatus = { type: 'success', message: `Cleared ${result.deleted_count} augmented images!` };
    render();
  } catch (err) {
    state.augStatus = { type: 'error', message: err.message || 'Failed to clear augmented images.' };
    renderWorkspacePartial();
  }
}

async function handleExportDataset() {
  state.exportStatus = { type: 'loading', message: 'Generating YOLO archive...', progress: 50 };
  renderWorkspacePartial();
  try {
    await window.API.exportYolo(state.activeProjectId);
    state.exportStatus = { type: 'success', message: 'YOLO dataset downloaded successfully!' };
  } catch (err) {
    state.exportStatus = { type: 'error', message: err.message || 'Export failed.' };
  }
  renderWorkspacePartial();
}

// ─── Video Frame Extraction ───────────────────────────────────────────────────
function handleVideoSelect(file) {
  if (!file.type.startsWith('video/')) {
    state.extractionStatus = { type: 'error', message: 'Please select a valid video file.' };
    renderWorkspacePartial();
    return;
  }
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.selectedVideo = file;
  state.videoUrl = URL.createObjectURL(file);
  state.extractionStatus = null;
  state.videoMetadata = null;

  const video = document.createElement('video');
  video.src = state.videoUrl;
  video.preload = 'metadata';
  video.muted = true;
  video.onloadedmetadata = () => {
    state.videoMetadata = {
      duration: video.duration,
      fps: 30,
      totalFrames: Math.round(video.duration * 30),
      width: video.videoWidth,
      height: video.videoHeight
    };
    renderWorkspacePartial();
  };
  video.onerror = () => {
    state.extractionStatus = { type: 'error', message: 'Failed to load video. Format may not be supported.' };
    renderWorkspacePartial();
  };
  renderWorkspacePartial();
}

function clearVideoState() {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.selectedVideo = null;
  state.videoUrl = null;
  state.videoMetadata = null;
  state.extractionStatus = null;
}

function clearSelectedVideo() {
  clearVideoState();
  renderWorkspacePartial();
}

function getExtractionTimestamps() {
  if (!state.videoMetadata) return [];
  const duration = state.videoMetadata.duration;
  const timestamps = [];
  if (state.extractionMode === 'interval') {
    for (let t = 0; t < duration; t += state.extractionInterval) timestamps.push(t);
  } else {
    const step = 1 / state.extractionFps;
    for (let t = 0; t < duration; t += step) timestamps.push(t);
  }
  return timestamps;
}

function captureFrameWithTimeout(video, time) {
  return new Promise((resolve, reject) => {
    let tid;
    const onSeeked = () => {
      clearTimeout(tid);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          reject(new Error('Canvas context unavailable'));
        }
      } catch (err) {
        reject(err);
      } finally {
        video.removeEventListener('seeked', onSeeked);
      }
    };
    tid = setTimeout(() => { video.removeEventListener('seeked', onSeeked); reject(new Error(`Seek timeout at ${time}s`)); }, 8000);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

async function handleExtractFrames() {
  if (!state.activeProjectId || !state.selectedVideo || !state.videoUrl) return;
  state.isExtracting = true;
  state.extractionStatus = null;
  const timestamps = getExtractionTimestamps();
  const total = timestamps.length;
  state.extractionProgress = { current: 0, total };
  renderWorkspacePartial();

  const video = document.createElement('video');
  video.src = state.videoUrl;
  video.muted = true;
  video.preload = 'auto';

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      setTimeout(() => reject(new Error('Video load timeout')), 10000);
    });

    const baseName = state.selectedVideo.name.replace(/\.[^/.]+$/, '');
    const batchItems = [];

    for (let i = 0; i < total; i++) {
      const ts = timestamps[i];
      const dataUrl = await captureFrameWithTimeout(video, ts);
      const mins = Math.floor(ts / 60);
      const secs = Math.floor(ts % 60);
      const ms = Math.round((ts % 1) * 1000);
      const tsStr = `${mins}m${String(secs).padStart(2, '0')}s_${String(ms).padStart(3, '0')}ms`;
      const name = `${baseName}_frame_${String(i + 1).padStart(3, '0')}_${tsStr}.jpg`;
      const b64 = dataUrl.split(',')[1] || '';
      batchItems.push({ name, size: Math.round(b64.length * 0.75), type: 'image/jpeg', dataUrl, annotated: false, createdAt: Date.now() + i });
      state.extractionProgress = { current: i + 1, total };
      if (i % 5 === 0) renderWorkspacePartial();
    }

    // Upload batch
    const newImages = await window.API.uploadBatch(state.activeProjectId, batchItems);
    state.images = [...state.images, ...newImages];
    const proj = state.projects.find(p => p.id === state.activeProjectId);
    if (proj) proj.imageCount = (proj.imageCount || 0) + newImages.length;
    state.extractionStatus = { type: 'success', message: `Successfully extracted and added ${newImages.length} frames.` };
    clearVideoState();
    state.importMode = 'images';
  } catch (err) {
    state.extractionStatus = { type: 'error', message: `Extraction failed: ${err.message || 'Unknown error'}` };
  } finally {
    state.isExtracting = false;
    state.extractionProgress = null;
    video.src = '';
    video.load();
    renderWorkspacePartial();
    renderGalleryPartial();
  }
}

// ─── AI Assist Handlers ───────────────────────────────────────────────────────
function handleModelDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.type === 'dragenter' || e.type === 'dragover') {
    state.modelDragActive = true;
  } else if (e.type === 'dragleave') {
    state.modelDragActive = false;
  }
  const dropzone = document.getElementById('model-dropzone');
  if (dropzone) {
    if (state.modelDragActive) {
      dropzone.classList.add('border-[#C084FC]', 'bg-[#C084FC]/5');
      dropzone.classList.remove('border-[#21262D]', 'bg-[#0F1116]/35');
    } else {
      dropzone.classList.remove('border-[#C084FC]', 'bg-[#C084FC]/5');
      dropzone.classList.add('border-[#21262D]', 'bg-[#0F1116]/35');
    }
  }
}
window.handleModelDrag = handleModelDrag;

function handleModelDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  state.modelDragActive = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.name.toLowerCase().endsWith('.onnx')) {
      handleModelUpload(file);
    } else {
      showToast('Please upload a .onnx file.', 'error');
    }
  }
}
window.handleModelDrop = handleModelDrop;

async function handleModelUpload(file) {
  if (!state.activeProjectId) return;
  const loadingToast = showToast('Uploading model and analyzing metadata...', 'loading');
  try {
    const model = await window.API.uploadModel(state.activeProjectId, file);
    state.projectModel = model;
    if (model.confidenceThreshold) {
      state.aiConfidenceThreshold = model.confidenceThreshold;
    }
    state.pendingClassNames = model.classNames || [];
    state.pendingMappingEdits = {};
    loadingToast.remove();
    showToast(`Model "${model.filename}" loaded with ${model.numClasses} classes.`, 'success');
  } catch (err) {
    loadingToast.remove();
    showToast(err.message || 'Failed to upload model.', 'error');
  } finally {
    renderWorkspacePartial();
  }
}

async function handleRemoveModel() {
  if (!state.activeProjectId) return;
  try {
    await window.API.deleteModel(state.activeProjectId);
    state.projectModel = null;
    state.pendingClassNames = [];
    state.pendingMappingEdits = {};
    state.inferenceStatus = null;
    showToast('Model removed.', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to remove model.', 'error');
  } finally {
    renderWorkspacePartial();
  }
}

async function handleSaveModelClasses() {
  if (!state.activeProjectId) return;
  const names = state.pendingClassNames.map(n => (n || '').trim()).filter(Boolean);
  if (names.length === 0) {
    showToast('Please specify at least one class name.', 'error');
    return;
  }
  try {
    const updated = await window.API.setModelClasses(state.activeProjectId, names);
    state.projectModel = updated;
    showToast('Class names saved.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save class names.', 'error');
  } finally {
    renderWorkspacePartial();
  }
}

async function handleSaveMapping() {
  if (!state.activeProjectId || !state.projectModel) return;
  const selects = document.querySelectorAll('.class-mapping-select');
  const mapping = {};
  selects.forEach(sel => {
    const idx = sel.dataset.modelIdx;
    const val = sel.value;
    if (val) {
      mapping[idx] = val;
    }
  });

  try {
    const res = await window.API.setClassMapping(state.activeProjectId, mapping);
    state.projectModel = res.model;
    const project = getActiveProject();
    if (project && res.allClasses) {
      project.classes = res.allClasses;
    }
    showToast('Class mapping saved.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save mapping.', 'error');
  } finally {
    renderWorkspacePartial();
    renderGalleryPartial();
  }
}

async function handleRunInferenceUnannotated() {
  if (!state.activeProjectId || !state.projectModel) return;
  state.inferenceRunning = true;
  state.inferenceStatus = null;
  state.inferenceProgress = { current: 0, total: state.images.filter(i => !i.annotated && !i.hasSuggestions).length || 1 };
  renderWorkspacePartial();

  try {
    const updatedImages = await window.API.runInferenceUnannotated(
      state.activeProjectId,
      state.aiConfidenceThreshold
    );
    // Merge updated images into state.images
    const updatedMap = new Map(updatedImages.map(img => [img.id, img]));
    state.images = state.images.map(img => updatedMap.get(img.id) || img);

    const totalSuggestions = updatedImages.reduce((acc, img) => acc + (img.aiSuggestions?.length || 0), 0);
    state.inferenceStatus = {
      type: 'success',
      message: `Inference complete: found ${totalSuggestions} suggested boxes across ${updatedImages.length} images.`
    };
    showToast(`Found ${totalSuggestions} AI suggestions.`, 'success');
  } catch (err) {
    state.inferenceStatus = {
      type: 'error',
      message: err.message || 'Inference failed.'
    };
    showToast(err.message || 'Inference failed.', 'error');
  } finally {
    state.inferenceRunning = false;
    state.inferenceProgress = null;
    renderWorkspacePartial();
    renderGalleryPartial();
  }
}

// ─── Annotator Integration ────────────────────────────────────────────────────
function openAnnotator(imageId) {
  const project = getActiveProject();
  if (!project) return;
  const image = state.images.find(i => i.id === imageId);
  if (!image) return;
  const idx = state.images.findIndex(i => i.id === imageId);
  window.BoxelAnnotator.open({
    image,
    images: state.images,
    currentIndex: idx,
    classes: project.classes || [],
    onSave: async (imgId, annotations) => {
      try {
        const updated = await window.API.saveAnnotations(imgId, annotations);
        const i = state.images.findIndex(im => im.id === imgId);
        if (i !== -1) state.images[i] = updated;
        renderGalleryPartial();
      } catch (err) {
        showToast('Failed to save annotations.', 'error');
      }
    },
    onUpdateSplit: async (imgId, split) => {
      try {
        const updated = await window.API.updateSplit(imgId, split);
        const i = state.images.findIndex(im => im.id === imgId);
        if (i !== -1) state.images[i] = updated;
        renderGalleryPartial();
      } catch (err) {
        showToast('Failed to update split.', 'error');
      }
    },
    onAcceptSuggestions: async (imgId, boxIds) => {
      try {
        const updated = await window.API.acceptSuggestions(imgId, boxIds);
        const i = state.images.findIndex(im => im.id === imgId);
        if (i !== -1) state.images[i] = updated;
        renderGalleryPartial();
        return updated;
      } catch (err) {
        showToast('Failed to accept suggestion.', 'error');
        throw err;
      }
    },
    onRejectSuggestions: async (imgId, boxIds) => {
      try {
        const updated = await window.API.rejectSuggestions(imgId, boxIds);
        const i = state.images.findIndex(im => im.id === imgId);
        if (i !== -1) state.images[i] = updated;
        renderGalleryPartial();
        return updated;
      } catch (err) {
        showToast('Failed to reject suggestion.', 'error');
        throw err;
      }
    },
    onImageChange: (newIdx) => {
      // Annotator will re-render itself
    }
  });
}

// ─── Settings Persistence ─────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await window.API.getSettings();
    state.settings = { ...state.settings, ...s };
  } catch (err) {
    console.warn('Could not load settings, using defaults.');
  }
}

async function saveSettings() {
  try {
    await window.API.saveSettings(state.settings);
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function init() {
  try {
    await loadSettings();
    state.projects = await window.API.getProjects();
  } catch (err) {
    console.error('Init failed:', err);
  }
  render();
}

// Wait for all scripts to load
window.addEventListener('DOMContentLoaded', init);
