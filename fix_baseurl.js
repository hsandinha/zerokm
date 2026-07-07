const fs = require('fs');
const glob = require('glob');

const files = glob.sync('app/api/checkout/**/*.ts');

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    if (content.includes('const baseUrlRaw = process.env.NEXTAUTH_URL')) {
        content = content.replace(
            /const baseUrlRaw = process\.env\.NEXTAUTH_URL \|\| '[^']+';\s*const baseUrl = baseUrlRaw\.includes\('localhost'\) \|\| baseUrlRaw\.includes\('127\.0\.0\.1'\) \? '[^']+' : baseUrlRaw;/g,
            "const host = req.headers.get('host') || 'www.cnv0km.com.br';\n    const protocol = host.includes('localhost') ? 'http' : 'https';\n    const baseUrl = `${protocol}://${host}`;"
        );
        changed = true;
    }

    if (content.includes('const baseUrl = process.env.NEXTAUTH_URL')) {
        content = content.replace(
            /const baseUrl = process\.env\.NEXTAUTH_URL \|\| 'http:\/\/localhost:3000';/g,
            "const host = req.headers.get('host') || 'www.cnv0km.com.br';\n    const protocol = host.includes('localhost') ? 'http' : 'https';\n    const baseUrl = `${protocol}://${host}`;"
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
}
