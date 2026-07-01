import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components/operator/VehicleConsultation.tsx');
let content = fs.readFileSync(file, 'utf-8');

// 1. isClientReadOnly -> always true
content = content.replace(
    /const isClientReadOnly = role === 'client' \|\| role === 'gratis' \|\| role === 'vendedor';/g,
    "const isClientReadOnly = true; // All edits moved to Pricing Catalog"
);

// 2. Remove "+ Novo Veículo" button
content = content.replace(
    /\{(?:\[[^\]]+\])\.includes\(role\) && \([\s\n]+<button[\s\n]+className=\{styles\.addButton\}[\s\n]+onClick=\{handleNewVehicleClick\}[\s\n]+title=\{showVehicleForm \? 'Fechar formulário' : 'Cadastrar Novo Veículo'\}[\s\n]+>[\s\n]+\{showVehicleForm \? 'Cancelar' : '\+ Novo Veículo'\}[\s\n]+<\/button>[\s\n]+\)\}/g,
    ""
);

// 3. Remove Operador filter chip
content = content.replace(
    /\{filters\.operador && \([\s\n]+<span style=\{\{ background: '#eef', border: '1px solid #99c', borderRadius: '12px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', color: '#1a1a1a' \}\}>[\s\n]+Operador: \{filters\.operador\}[\s\n]+<button onClick=\{\(\) => \{ setFilters\(\{ \.\.\.filters, operador: '' \}\); setCurrentPage\(1\); \}\} style=\{\{ marginLeft: '6px', border: 'none', background: 'transparent', cursor: 'pointer' \}\}>✕<\/button>[\s\n]+<\/span>[\s\n]+\)\}/g,
    ""
);

// 4. Remove Operador table header
content = content.replace(
    /\{role !== 'client' && role !== 'gratis' && \([\s\n]+<th className=\{styles\.tableHeader\} onClick=\{\(\) => handleSort\('operador'\)\} style=\{\{ cursor: 'pointer' \}\}>[\s\n]+OPERADOR \{sortConfig\.key === 'operador' && \(sortConfig\.direction === 'asc' \? '▲' : '▼'\)\}[\s\n]+<\/th>[\s\n]+\)\}/g,
    ""
);

// 5. Remove Operador table cell
content = content.replace(
    /\{role !== 'client' && role !== 'gratis' && \([\s\n]+<td className=\{styles\.tableCell\}>[\s\n]+<EditableTextCell[\s\n]+value=\{vehicle\.operador\}[\s\n]+onSave=\{\(newValue\) => handleUpdateVehicleField\(vehicle, 'operador', newValue\)\}[\s\n]+placeholder="Operador"[\s\n]+\/>[\s\n]+<\/td>[\s\n]+\)\}/g,
    ""
);

// 6. Remove Edit/Delete buttons (preserve location button)
content = content.replace(
    /\{!\[[^\]]+\]\.includes\(role\) && \([\s\n]+<>[\s\n]+<span[\s\n]+className=\{styles\.editButton\}[\s\n]+title="Editar"[\s\n]+onClick=\{\(\) => handleEditVehicle\(vehicle\)\}[\s\n]+role="button"[\s\n]+tabIndex=\{0\}[\s\n]+>[\s\n]+✏️[\s\n]+<\/span>[\s\n]+<span[\s\n]+className=\{styles\.deleteButton\}[\s\n]+title="Excluir"[\s\n]+onClick=\{\(\) => handleDeleteVehicle\(vehicle\)\}[\s\n]+role="button"[\s\n]+tabIndex=\{0\}[\s\n]+>[\s\n]+🗑️[\s\n]+<\/span>[\s\n]+<\/>[\s\n]+\)\}/g,
    ""
);

fs.writeFileSync(file, content);
console.log("Replacements complete.");
