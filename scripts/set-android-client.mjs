// Uso: node scripts/set-android-client.mjs <ID-do-cliente>.apps.googleusercontent.com
// Grava o ID do cliente Android do Google nos dois lugares que precisam dele (código e AndroidManifest).
import { writeFileSync } from 'node:fs'

const id = process.argv[2] ?? ''
if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)) { console.error('Informe o ID do cliente, terminando em .apps.googleusercontent.com'); process.exit(1) }
const scheme = `com.googleusercontent.apps.${id.replace(/\.apps\.googleusercontent\.com$/, '')}`
writeFileSync(new URL('../src/lib/google-android.json', import.meta.url), `${JSON.stringify({ clientId: id }, null, 2)}\n`)
writeFileSync(new URL('../android/app/src/main/res/values/oauth.xml', import.meta.url), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="google_redirect_scheme">${scheme}</string>\n</resources>\n`)
console.log(`Cliente Android configurado: ${scheme}`)
