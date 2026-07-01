import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components/operator/VehicleConsultation.tsx');
let content = fs.readFileSync(file, 'utf-8');

// Remove Edit/Delete buttons from VehicleCard
content = content.replace(
    /\{!\[[^\]]+\]\.includes\(role\) && \([\s\n]+<>[\s\n]+<span[\s\n]+className=\{styles\.editButton\}[\s\n]+title="Editar"[\s\n]+onClick=\{\(\) => onEdit\(vehicle\)\}[\s\n]+role="button"[\s\n]+tabIndex=\{0\}[\s\n]+>[\s\n]+✏️[\s\n]+<\/span>[\s\n]+<span[\s\n]+className=\{styles\.deleteButton\}[\s\n]+title="Excluir"[\s\n]+onClick=\{\(\) => onDelete\(vehicle\)\}[\s\n]+role="button"[\s\n]+tabIndex=\{0\}[\s\n]+>[\s\n]+🗑️[\s\n]+<\/span>[\s\n]+<\/>[\s\n]+\)\}/g,
    ""
);

fs.writeFileSync(file, content);
console.log("VehicleCard replacements complete.");
