/**
 * fileIcons — 文件类型图标（Material Icon Theme 风格）
 *
 * 文件树中按文件名/扩展名返回一个彩色短标签（如 JS、TS、VUE），
 * 颜色取自 VS Code Material Icon Theme 的品牌色，无需额外图标依赖。
 */
const SPECIAL_FILES = {
    'package.json': { label: 'NPM', color: '#CB3837' },
    'package-lock.json': { label: 'NPM', color: '#CB3837' },
    'tsconfig.json': { label: 'TS', color: '#3178C6' },
    'vite.config.js': { label: 'V', color: '#646CFF' },
    'vite.config.ts': { label: 'V', color: '#646CFF' },
    '.gitignore': { label: 'GIT', color: '#F05032' },
    '.gitattributes': { label: 'GIT', color: '#F05032' },
    '.editorconfig': { label: 'ED', color: '#6D8086' },
    '.env': { label: 'ENV', color: '#10B981' },
    'dockerfile': { label: 'DOC', color: '#2496ED' },
    'makefile': { label: 'MK', color: '#6D8086' },
    'license': { label: 'LIC', color: '#D0BF41' },
    'license.md': { label: 'LIC', color: '#D0BF41' },
    'readme.md': { label: 'MD', color: '#4A90D9' }
};

const EXTENSIONS = {
    js: { label: 'JS', color: '#C9A227' },
    mjs: { label: 'JS', color: '#C9A227' },
    cjs: { label: 'JS', color: '#C9A227' },
    jsx: { label: 'JSX', color: '#61AFCB' },
    ts: { label: 'TS', color: '#3178C6' },
    tsx: { label: 'TSX', color: '#3178C6' },
    mts: { label: 'TS', color: '#3178C6' },
    vue: { label: 'VUE', color: '#41B883' },
    svelte: { label: 'SVE', color: '#FF3E00' },
    html: { label: 'HTML', color: '#E44D26' },
    htm: { label: 'HTML', color: '#E44D26' },
    css: { label: 'CSS', color: '#3B82F6' },
    scss: { label: 'SCSS', color: '#C6538C' },
    sass: { label: 'SASS', color: '#C6538C' },
    less: { label: 'LESS', color: '#1D365D' },
    json: { label: 'JSON', color: '#B58C1F' },
    jsonc: { label: 'JSON', color: '#B58C1F' },
    json5: { label: 'JSON', color: '#B58C1F' },
    yml: { label: 'YML', color: '#C0392B' },
    yaml: { label: 'YML', color: '#C0392B' },
    toml: { label: 'TOML', color: '#9C4221' },
    xml: { label: 'XML', color: '#8B5CF6' },
    md: { label: 'MD', color: '#4A90D9' },
    mdx: { label: 'MDX', color: '#4A90D9' },
    txt: { label: 'TXT', color: '#8A94A6' },
    log: { label: 'LOG', color: '#8A94A6' },
    csv: { label: 'CSV', color: '#217346' },
    sh: { label: 'SH', color: '#4CAF50' },
    bash: { label: 'SH', color: '#4CAF50' },
    zsh: { label: 'SH', color: '#4CAF50' },
    ps1: { label: 'PS', color: '#012456' },
    bat: { label: 'BAT', color: '#6D8086' },
    py: { label: 'PY', color: '#3776AB' },
    go: { label: 'GO', color: '#00ADD8' },
    rs: { label: 'RS', color: '#B7410E' },
    java: { label: 'JAVA', color: '#B07219' },
    kt: { label: 'KT', color: '#A97BFF' },
    c: { label: 'C', color: '#5C6BC0' },
    h: { label: 'H', color: '#5C6BC0' },
    cpp: { label: 'CPP', color: '#00599C' },
    cc: { label: 'CPP', color: '#00599C' },
    hpp: { label: 'HPP', color: '#00599C' },
    cs: { label: 'CS', color: '#68217A' },
    php: { label: 'PHP', color: '#777BB4' },
    rb: { label: 'RB', color: '#CC342D' },
    lua: { label: 'LUA', color: '#2C2D72' },
    sql: { label: 'SQL', color: '#E38C00' },
    ini: { label: 'INI', color: '#6D8086' },
    conf: { label: 'CONF', color: '#6D8086' },
    properties: { label: 'PROP', color: '#6D8086' },
    png: { label: 'IMG', color: '#A855F7' },
    jpg: { label: 'IMG', color: '#A855F7' },
    jpeg: { label: 'IMG', color: '#A855F7' },
    gif: { label: 'IMG', color: '#A855F7' },
    webp: { label: 'IMG', color: '#A855F7' },
    svg: { label: 'SVG', color: '#FFB13B' },
    ico: { label: 'ICO', color: '#A855F7' },
    pdf: { label: 'PDF', color: '#E5252A' }
};

const DEFAULT_ICON = { label: 'FILE', color: '#8A94A6' };

// 文件夹图标色：与 Material Icon Theme 的 folder 配色一致
const FOLDER_COLORS = {
    src: '#4CAF50',
    test: '#8BC34A',
    tests: '#8BC34A',
    components: '#7E57C2',
    views: '#42A5F5',
    assets: '#FF7043',
    public: '#64B5F6',
    docs: '#42A5F5',
    node_modules: '#616161',
    '.git': '#F4511E',
    dist: '#616161',
    build: '#616161',
    config: '#6D8086',
    styles: '#C6538C',
    utils: '#FFCA28',
    lib: '#FFCA28',
    scripts: '#6D8086'
};

const DEFAULT_FOLDER_COLOR = '#90A4AE';

/**
 * 解析文件夹图标颜色
 * @param {string} name 文件夹名
 * @returns {{ color: string }}
 */
export function resolveFolderIcon(name) {
    const lower = String(name || '').toLowerCase();
    return { color: FOLDER_COLORS[lower] || DEFAULT_FOLDER_COLOR };
}


/**
 * 解析文件名对应的彩色标签图标
 * @param {string} name 文件名（含扩展名）
 * @returns {{ label: string, color: string }}
 */
export function resolveFileIcon(name) {
    const lower = String(name || '').toLowerCase();
    if (SPECIAL_FILES[lower]) return SPECIAL_FILES[lower];
    const dot = lower.lastIndexOf('.');
    const ext = dot > 0 ? lower.slice(dot + 1) : '';
    if (EXTENSIONS[ext]) return EXTENSIONS[ext];
    if (ext) return { label: ext.slice(0, 3).toUpperCase(), color: DEFAULT_ICON.color };
    return DEFAULT_ICON;
}
