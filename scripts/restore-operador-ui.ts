import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components/operator/VehicleConsultation.tsx');
let content = fs.readFileSync(file, 'utf-8');

// 1. Restore Operador filter chip
const filterChipStr = `                                    {filters.operador && (
                                        <span style={{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' }}>
                                            Operador: {filters.operador}
                                            <button onClick={() => { setFilters({ ...filters, operador: '' }); setCurrentPage(1); }} style={{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                                        </span>
                                    )}`;

content = content.replace(
    /\{filters\.estado && \([\s\S]*?<\/span>[\s\n]*\)\}/g,
    `$&
${filterChipStr}`
);

// 2. Restore Operador table header
const thStr = `                                            {role !== 'client' && role !== 'gratis' && (
                                                <th className={styles.tableHeader} onClick={() => handleSort('operador')} style={{ cursor: 'pointer' }}>
                                                    OPERADOR {sortConfig.key === 'operador' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                                </th>
                                            )}`;
content = content.replace(
    /\{!\[[^\]]+\]\.includes\(role\) && \([\s\S]*?<th className=\{styles\.tableHeader\} onClick=\{\(\) => handleSort\('frete'\)\} style=\{\{ cursor: 'pointer' \}\}>[\s\S]*?<\/th>[\s\n]*\)\}/g,
    `$&
${thStr}`
);

// 3. Restore Operador table cell (read-only)
const tdStr = `                                                {role !== 'client' && role !== 'gratis' && (
                                                    <td className={styles.tableCell}>
                                                        {isClientReadOnly ? (
                                                            <HighlightText text={vehicle.operador} searchTerm={pendingSearchTerm} />
                                                        ) : (
                                                            vehicle.operador || '-'
                                                        )}
                                                    </td>
                                                )}`;
content = content.replace(
    /\{!\[[^\]]+\]\.includes\(role\) && \([\s\n]*<td className=\{styles\.tableCell\}>[\s\n]*<EditableCurrencyCell[\s\S]*?\/>[\s\n]*<\/td>[\s\n]*\)\}/g,
    `$&
${tdStr}`
);

fs.writeFileSync(file, content);
console.log("Restored operator UI");
